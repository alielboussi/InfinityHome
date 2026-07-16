package com.bestrest.factoryproduction.data

import android.util.Log
import com.bestrest.factoryproduction.models.CartItem
import com.bestrest.factoryproduction.models.CategoryItem
import com.bestrest.factoryproduction.models.ProductItem
import com.bestrest.factoryproduction.models.UnitItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class LabelJobState(
  val id: String,
  val status: String,
  val error: String?
)

data class PrintJobHistoryItem(
  val id: String,
  val status: String,
  val error: String?,
  val createdAt: String,
  val transferId: String,
  val itemCount: Int,
  val payloadJson: String
)

data class FactoryApproveResult(
  val sessionId: String,
  val transferNumber: String?,
  val labelJobId: String?
)

private fun shouldReuseLabelJob(status: String?): Boolean {
  val normalized = status?.trim()?.lowercase() ?: ""
  return normalized == "pending" || normalized == "processing" || normalized == "done"
}

class ProductRepository(private val client: SupabaseClient) {
  private val logTag = "FactoryProduction"
  private val transferPrefix = "#FacWar"
  private val transferDigits = 7
  private val http = OkHttpClient()
  private val jsonType = "application/json".toMediaType()

  private fun preview(value: String, maxLen: Int = 500): String {
    return if (value.length <= maxLen) value else value.substring(0, maxLen) + "..."
  }

  private suspend fun fetchLabelJobsViaApi(
    limit: Int = 120,
    jobId: String? = null,
    transferId: String? = null
  ): JSONArray = withContext(Dispatchers.IO) {
    val apiBase = AppConfig.API_BASE.trim().trimEnd('/')
    if (apiBase.isBlank()) throw IllegalStateException("API base is not configured.")

    val safeLimit = limit.coerceIn(1, 500)
    val urlBuilder = "$apiBase/api/label-print-history".toHttpUrl().newBuilder()
      .addQueryParameter("limit", safeLimit.toString())

    val cleanJobId = jobId?.trim().orEmpty()
    if (cleanJobId.isNotBlank()) {
      urlBuilder.addQueryParameter("id", cleanJobId)
    }

    val cleanTransferId = transferId?.trim().orEmpty()
    if (cleanTransferId.isNotBlank()) {
      urlBuilder.addQueryParameter("transferId", cleanTransferId)
    }

    val request = Request.Builder()
      .url(urlBuilder.build())
      .get()
      .addHeader("Accept", "application/json")
      .build()

    http.newCall(request).execute().use { response ->
      val raw = response.body?.string().orEmpty()
      if (!response.isSuccessful) {
        Log.e(logTag, "fetchLabelJobsViaApi HTTP failure: code=${response.code}, body=${preview(raw)}")
        throw IllegalStateException("Label history API HTTP ${response.code}: $raw")
      }
      val parsed = JSONObject(raw)
      if (!parsed.optBoolean("ok", false)) {
        Log.e(logTag, "fetchLabelJobsViaApi API returned ok=false: body=${preview(raw)}")
        throw IllegalStateException(parsed.optString("error", "Label history API failed."))
      }
      return@use parsed.optJSONArray("jobs") ?: JSONArray()
    }
  }

  private suspend fun fetchLabelJobsDirect(
    limit: Int = 120,
    jobId: String? = null
  ): JSONArray {
    val query = linkedMapOf(
      "select" to "id,status,error,payload,created_at",
      "order" to "created_at.desc",
      "limit" to limit.coerceIn(1, 500).toString()
    )
    val cleanJobId = jobId?.trim().orEmpty()
    if (cleanJobId.isNotBlank()) {
      query["id"] = "eq.$cleanJobId"
      query["limit"] = "1"
    }
    return JSONArray(
      client.get(
        path = "rest/v1/label_print_jobs",
        query = query
      )
    )
  }

  private suspend fun fetchLabelJobsForRead(
    limit: Int = 120,
    jobId: String? = null,
    transferId: String? = null
  ): JSONArray {
    return try {
      fetchLabelJobsViaApi(limit = limit, jobId = jobId, transferId = transferId)
    } catch (apiErr: Exception) {
      Log.w(logTag, "Label history API unavailable, falling back to direct read: ${apiErr.message}")
      fetchLabelJobsDirect(limit = limit, jobId = jobId)
    }
  }

  suspend fun fetchCarpentryProducts(): List<ProductItem> {
    Log.d(logTag, "Loading products for location ${AppConfig.CARPENTRY_LOCATION_ID}")
    val locationRows = client.get(
      path = "rest/v1/product_locations",
      query = mapOf(
        "select" to "product_id",
        "location_id" to "eq.${AppConfig.CARPENTRY_LOCATION_ID}"
      )
    )

    val locationJson = JSONArray(locationRows)
    Log.d(logTag, "product_locations rows: ${locationJson.length()}")
    val productIds = mutableListOf<String>()
    for (i in 0 until locationJson.length()) {
      val row = locationJson.getJSONObject(i)
      val pid = row.optString("product_id", "")
      if (pid.isNotBlank()) productIds.add(pid)
    }

    Log.d(logTag, "Resolved ${productIds.size} product ids")

    if (productIds.isEmpty()) return emptyList()

    val products = mutableListOf<ProductItem>()
    val chunks = productIds.chunked(100)
    for (chunk in chunks) {
      val inFilter = "in.(${chunk.joinToString(",")})"
      val result = client.get(
        path = "rest/v1/products",
        query = mapOf(
          "select" to "id,name,sku",
          "id" to inFilter,
          "order" to "name.asc"
        )
      )

      val arr = JSONArray(result)
      Log.d(logTag, "Fetched ${arr.length()} products for chunk")
      for (i in 0 until arr.length()) {
        val row = arr.getJSONObject(i)
        val id = row.optString("id", "")
        if (id.isBlank()) continue
        val name = row.optString("name", "")
        val sku = row.optString("sku", "")
        products.add(ProductItem(id = id, name = name, sku = sku))
      }
    }
    Log.d(logTag, "Returning ${products.size} carpentry products")
    return products.sortedBy { it.name.lowercase() }
  }

  suspend fun fetchCategories(): List<CategoryItem> {
    val response = client.get(
      path = "rest/v1/categories",
      query = mapOf(
        "select" to "id,name",
        "order" to "name.asc"
      )
    )
    val arr = JSONArray(response)
    val list = ArrayList<CategoryItem>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      list.add(CategoryItem(
        id = row.optInt("id", 0),
        name = row.optString("name", "")
      ))
    }
    return list.filter { it.id != 0 }
  }

  suspend fun fetchUnits(): List<UnitItem> {
    val response = client.get(
      path = "rest/v1/unit_of_measure",
      query = mapOf(
        "select" to "id,name,abbreviation",
        "order" to "name.asc"
      )
    )
    val arr = JSONArray(response)
    val list = ArrayList<UnitItem>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      list.add(UnitItem(
        id = row.optInt("id", 0),
        name = row.optString("name", ""),
        abbreviation = row.optString("abbreviation", "")
      ))
    }
    return list.filter { it.id != 0 }
  }

  suspend fun getNextAutoSku(): String {
    val response = client.get(
      path = "rest/v1/products",
      query = mapOf("select" to "sku")
    )
    val arr = JSONArray(response)
    val used = mutableSetOf<Int>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      val raw = row.optString("sku", "")
      val match = Regex("^#?(\\d+)$").find(raw.trim())
      if (match != null) {
        val value = match.groupValues[1].toIntOrNull()
        if (value != null) used.add(value)
      }
    }
    var next = 1
    while (used.contains(next)) next += 1
    return "#" + next.toString().padStart(5, '0')
  }

  suspend fun createProduct(
    name: String,
    sku: String,
    categoryId: Int?,
    unitId: Int?
  ): ProductItem {
    val payload = JSONArray().put(
      JSONObject()
        .put("name", name)
        .put("sku", sku)
        .put("sku_type", true)
        .put("price", 0.0)
        .put("standard_price", 0.0)
        .put("promotional_price", 0.0)
        .put("cost_price", 0.0)
        .put("currency", "K")
        .put("category_id", categoryId ?: JSONObject.NULL)
        .put("unit_of_measure_id", unitId ?: JSONObject.NULL)
    )

    val response = client.post(
      path = "rest/v1/products",
      bodyJson = payload.toString(),
      prefer = "return=representation"
    )

    val arr = JSONArray(response)
    if (arr.length() == 0) throw IllegalStateException("Product creation failed.")
    val row = arr.getJSONObject(0)
    val id = row.optString("id", "")
    if (id.isBlank()) throw IllegalStateException("Product creation failed.")
    return ProductItem(id = id, name = row.optString("name", name), sku = row.optString("sku", sku))
  }

  suspend fun upsertProductLocations(productId: String, locationIds: List<String>) {
    if (locationIds.isEmpty()) return
    val rows = JSONArray()
    locationIds.distinct().forEach { locId ->
      rows.put(JSONObject().put("product_id", productId).put("location_id", locId))
    }
    client.post(
      path = "rest/v1/product_locations",
      bodyJson = rows.toString(),
      prefer = "resolution=merge-duplicates"
    )
  }

  suspend fun fetchInventory(locationId: String, productIds: List<String>): Map<String, Pair<String?, Double>> {
    if (productIds.isEmpty()) return emptyMap()
    val pid = productIds.joinToString(",") { "\"$it\"" }
    val response = client.get(
      path = "rest/v1/inventory",
      query = mapOf(
        "select" to "id,product_id,quantity",
        "location" to "eq.$locationId",
        "product_id" to "in.($pid)"
      )
    )
    val arr = JSONArray(response)
    val map = mutableMapOf<String, Pair<String?, Double>>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      val pidValue = row.optString("product_id", "")
      if (pidValue.isBlank()) continue
      val idValue = row.optString("id")
      val rowId = idValue.takeIf { it.isNotBlank() }
      map[pidValue] = Pair(rowId, row.optDouble("quantity", 0.0))
    }
    return map
  }

  suspend fun updateInventoryRow(id: String, qty: Double) {
    val payload = JSONObject().put("quantity", qty)
    client.patch(
      path = "rest/v1/inventory",
      bodyJson = payload.toString(),
      query = mapOf("id" to "eq.$id")
    )
  }

  suspend fun insertInventoryRow(productId: String, locationId: String, qty: Double) {
    val payload = JSONArray().put(
      JSONObject()
        .put("product_id", productId)
        .put("location", locationId)
        .put("quantity", qty)
    )
    client.post(
      path = "rest/v1/inventory",
      bodyJson = payload.toString()
    )
  }

  suspend fun getNextTransferNumber(): String {
    val response = client.get(
      path = "rest/v1/stock_transfer_sessions",
      query = mapOf(
        "select" to "delivery_number",
        "delivery_number" to "like.${transferPrefix}%",
        "order" to "delivery_number.desc",
        "limit" to "1"
      )
    )
    val arr = JSONArray(response)
    var next = 1
    if (arr.length() > 0) {
      val raw = arr.getJSONObject(0).optString("delivery_number", "")
      val match = Regex("^${Regex.escape(transferPrefix)}(\\d+)$").find(raw)
      val value = match?.groupValues?.getOrNull(1)?.toIntOrNull()
      if (value != null) next = value + 1
    }
    return transferPrefix + next.toString().padStart(transferDigits, '0')
  }

  suspend fun createTransferSession(
    fromLocation: String,
    toLocation: String,
    userId: Int,
    userEmail: String,
    capturedAt: String,
    totalQty: Double,
    transferNumber: String? = null
  ): String {
    val meta = JSONObject()
      .put("user_id", userId)
      .put("user_email", userEmail)
      .put("source", "factory_production")
    val transferDate = if (capturedAt.length >= 10) capturedAt.take(10) else capturedAt
    val row = JSONObject()
      .put("from_location", fromLocation)
      .put("to_location", toLocation)
      .put("user_id", userId)
      .put("user_uid", JSONObject.NULL)
      .put("transfer_date", transferDate)
      .put("created_at", capturedAt)
      .put("transfer_datetime", capturedAt)
      .put("delivery_number", transferNumber?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
      .put("status", "approved")
      .put("total_qty", totalQty)
      .put("metadata", meta)

    val response = client.post(
      path = "rest/v1/stock_transfer_sessions",
      bodyJson = JSONArray().put(row).toString(),
      prefer = "return=representation"
    )

    val arr = JSONArray(response)
    if (arr.length() == 0) throw IllegalStateException("Transfer session creation failed.")
    val id = arr.getJSONObject(0).optString("id", "")
    if (id.isBlank()) throw IllegalStateException("Transfer session creation failed.")
    return id
  }

  suspend fun insertTransferEntries(sessionId: String, items: List<CartItem>) {
    val rows = JSONArray()
    items.forEach { item ->
      if (item.qty > 0) {
        rows.put(
          JSONObject()
            .put("session_id", sessionId)
            .put("product_id", item.product.id)
            .put("quantity", item.qty)
        )
      }
    }
    if (rows.length() == 0) {
      throw IllegalStateException("No positive quantity items to process.")
    }
    client.post(
      path = "rest/v1/stock_transfer_entries",
      bodyJson = rows.toString()
    )
  }

  suspend fun createLabelJob(payload: JSONObject): String = withContext(Dispatchers.IO) {
    val apiBase = AppConfig.API_BASE.trim().trimEnd('/')
    if (apiBase.isBlank()) throw IllegalStateException("API base is not configured.")

    val endpoint = "$apiBase/api/label-print-job"
    val transferId = payload.optString("transfer_id", "")
    val itemCount = payload.optJSONArray("items")?.length() ?: 0
    val isTestPrint = payload.optBoolean("is_test_print", false)
    Log.d(logTag, "createLabelJob request: endpoint=$endpoint, transferId=$transferId, isTestPrint=$isTestPrint, itemCount=$itemCount")

    val body = JSONObject().put("payload", payload).toString()
    val request = Request.Builder()
      .url(endpoint)
      .post(body.toRequestBody(jsonType))
      .addHeader("Content-Type", "application/json")
      .build()
    http.newCall(request).execute().use { response ->
      val raw = response.body?.string().orEmpty()
      if (!response.isSuccessful) {
        Log.e(logTag, "createLabelJob HTTP failure: code=${response.code}, body=${preview(raw)}")
        throw IllegalStateException("Label queue API HTTP ${response.code}: $raw")
      }
      val parsed = JSONObject(raw)
      if (!parsed.optBoolean("ok", false)) {
        Log.e(logTag, "createLabelJob API returned ok=false: body=${preview(raw)}")
        throw IllegalStateException(parsed.optString("error", "Label queue API failed."))
      }
      val job = parsed.optJSONObject("job")
      val id = job?.optString("id", "").orEmpty()
      if (id.isBlank()) throw IllegalStateException("Label queue API returned empty id.")
      Log.d(logTag, "createLabelJob success: transferId=$transferId, jobId=$id")
      return@use id
    }
  }

  suspend fun approveFactoryTransferViaApi(
    fromLocation: String,
    toLocation: String,
    userId: Int,
    userEmail: String,
    userFullName: String,
    capturedAt: String,
    transferNumber: String?,
    items: List<CartItem>
  ): FactoryApproveResult = withContext(Dispatchers.IO) {
    val apiBase = AppConfig.API_BASE.trim().trimEnd('/')
    if (apiBase.isBlank()) throw IllegalStateException("API base is not configured.")
    val endpoint = "$apiBase/api/factory-production-approve"

    val itemArray = JSONArray()
    items.forEach { item ->
      if (item.qty > 0) {
        itemArray.put(
          JSONObject()
            .put("productId", item.product.id)
            .put("name", item.product.name)
            .put("sku", item.product.sku ?: "")
            .put("qty", item.qty)
        )
      }
    }
    if (itemArray.length() == 0) throw IllegalStateException("No positive quantity items to process.")
    Log.d(
      logTag,
      "approveFactoryTransferViaApi request: endpoint=$endpoint, fromLocation=$fromLocation, toLocation=$toLocation, userId=$userId, transferNumber=${transferNumber ?: ""}, itemCount=${itemArray.length()}"
    )

    val body = JSONObject()
      .put("fromLocation", fromLocation)
      .put("toLocation", toLocation)
      .put("userId", userId)
      .put("userEmail", userEmail)
      .put("userFullName", userFullName)
      .put("capturedAt", capturedAt)
      .put("transferNumber", transferNumber ?: JSONObject.NULL)
      .put("items", itemArray)
      .toString()

    val request = Request.Builder()
      .url(endpoint)
      .post(body.toRequestBody(jsonType))
      .addHeader("Content-Type", "application/json")
      .build()

    http.newCall(request).execute().use { response ->
      val raw = response.body?.string().orEmpty()
      if (!response.isSuccessful) {
        Log.e(logTag, "approveFactoryTransferViaApi HTTP failure: code=${response.code}, body=${preview(raw)}")
        throw IllegalStateException("Approve API HTTP ${response.code}: $raw")
      }
      val parsed = JSONObject(raw)
      if (!parsed.optBoolean("ok", false)) {
        Log.e(logTag, "approveFactoryTransferViaApi API returned ok=false: body=${preview(raw)}")
        throw IllegalStateException(parsed.optString("error", "Approval failed."))
      }
      val sessionId = parsed.optString("sessionId", "")
      if (sessionId.isBlank()) throw IllegalStateException("Approval failed: missing session id.")
      val transferNo = parsed.optString("transferNumber", "").ifBlank { null }
      val labelJobId = parsed.optString("labelJobId", "").ifBlank { null }
      Log.d(
        logTag,
        "approveFactoryTransferViaApi success: sessionId=$sessionId, transferNumber=${transferNo ?: ""}, labelJobId=${labelJobId ?: ""}"
      )
      return@use FactoryApproveResult(sessionId = sessionId, transferNumber = transferNo, labelJobId = labelJobId)
    }
  }

  suspend fun enqueueLabelJobWithRetry(
    payload: JSONObject,
    attempts: Int = 8,
    delayMs: Long = 2500
  ): String {
    val transferId = payload.optString("transfer_id", "")
    if (transferId.isNotBlank()) {
      val existing = findLatestLabelJobByTransferId(transferId)
      if (existing != null && shouldReuseLabelJob(existing.status)) {
        return existing.id
      }
    }

    var lastErr: Exception? = null
    val safeAttempts = if (attempts < 1) 1 else attempts
    for (attempt in 1..safeAttempts) {
      try {
        return createLabelJob(payload)
      } catch (err: Exception) {
        lastErr = err
        if (transferId.isNotBlank()) {
          val existing = findLatestLabelJobByTransferId(transferId)
          if (existing != null && shouldReuseLabelJob(existing.status)) {
            return existing.id
          }
        }
        if (attempt < safeAttempts) {
          delay(delayMs)
        }
      }
    }
    throw lastErr ?: IllegalStateException("Print job queue failed.")
  }

  suspend fun findLatestLabelJobByTransferId(transferId: String): LabelJobState? {
    if (transferId.isBlank()) return null
    val arr = fetchLabelJobsForRead(limit = 100, transferId = transferId)
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      val payload = row.optJSONObject("payload") ?: continue
      val candidateTransferId = payload.optString("transfer_id", "")
      if (candidateTransferId != transferId) continue
      return LabelJobState(
        id = row.optString("id", ""),
        status = row.optString("status", ""),
        error = row.optString("error", "").ifBlank { null }
      )
    }
    return null
  }

  suspend fun findLabelJobById(jobId: String): LabelJobState? {
    if (jobId.isBlank()) return null
    val arr = fetchLabelJobsForRead(limit = 1, jobId = jobId)
    if (arr.length() == 0) return null
    val row = arr.getJSONObject(0)
    return LabelJobState(
      id = row.optString("id", ""),
      status = row.optString("status", ""),
      error = row.optString("error", "").ifBlank { null }
    )
  }

  suspend fun fetchRecentLabelJobs(limit: Int = 120): List<PrintJobHistoryItem> {
    val arr = fetchLabelJobsForRead(limit = limit)
    val completedStatuses = setOf("done", "completed", "printed", "success")
    val statusCounts = linkedMapOf<String, Int>()
    val out = ArrayList<PrintJobHistoryItem>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      val rawStatus = row.optString("status", "")
      val normalizedStatus = rawStatus.trim().lowercase()
      val statusKey = if (normalizedStatus.isBlank()) "<blank>" else normalizedStatus
      statusCounts[statusKey] = (statusCounts[statusKey] ?: 0) + 1
      if (normalizedStatus !in completedStatuses) continue

      val payload = row.optJSONObject("payload")
      val transferId = payload?.optString("transfer_id", "") ?: ""
      val isTestPrint = payload?.optBoolean("is_test_print", false) == true || transferId.startsWith("test-print-")
      if (isTestPrint) continue
      val items = payload?.optJSONArray("items")
      out.add(
        PrintJobHistoryItem(
          id = row.optString("id", ""),
          status = row.optString("status", ""),
          error = row.optString("error", "").ifBlank { null },
          createdAt = row.optString("created_at", ""),
          transferId = transferId,
          itemCount = items?.length() ?: 0,
          payloadJson = (payload ?: JSONObject()).toString()
        )
      )
    }
    Log.d(logTag, "fetchRecentLabelJobs statuses=${statusCounts} returned=${out.size}")
    return out
  }

  suspend fun reprintLabelJobFromPayload(
    sourcePayload: JSONObject,
    sourceJobId: String,
    itemsOverride: JSONArray? = null
  ): String {
    val cloned = JSONObject(sourcePayload.toString())
    if (itemsOverride != null) {
      cloned.put("items", itemsOverride)
    }

    val baseTransferId = cloned.optString("transfer_id", "job-$sourceJobId").ifBlank { "job-$sourceJobId" }
    cloned.put("transfer_id", "$baseTransferId-reprint-${System.currentTimeMillis()}")
    cloned.put("reprint", true)
    cloned.put("reprint_of_job_id", sourceJobId)

    return createLabelJob(cloned)
  }

  suspend fun reprintLabelJobById(jobId: String): String {
    if (jobId.isBlank()) throw IllegalStateException("Missing job id.")
    val response = client.get(
      path = "rest/v1/label_print_jobs",
      query = mapOf(
        "select" to "id,payload",
        "id" to "eq.$jobId",
        "limit" to "1"
      )
    )
    val arr = JSONArray(response)
    if (arr.length() == 0) throw IllegalStateException("Print job not found.")
    val source = arr.getJSONObject(0)
    val payload = source.optJSONObject("payload") ?: throw IllegalStateException("Print job payload missing.")

    return reprintLabelJobFromPayload(
      sourcePayload = payload,
      sourceJobId = jobId,
      itemsOverride = null
    )
  }
}
