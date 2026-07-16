package com.bestrest.warehousetransfers.data

import android.util.Log
import com.bestrest.warehousetransfers.models.LineKind
import com.bestrest.warehousetransfers.models.ProductItem
import com.bestrest.warehousetransfers.models.TransferLine
import org.json.JSONArray
import org.json.JSONObject

data class DeliverySessionSummary(
  val id: String,
  val deliveryNumber: String,
  val status: String,
  val submittedAt: String?,
  val completedAt: String?,
  val totalQty: Double,
  val productCount: Int,
  val pdfUrl: String?
)

data class SubmitDeliveryResult(
  val sessionId: String,
  val deliveryNumber: String,
  val duplicate: Boolean
)

class ProductRepository(private val client: SupabaseClient) {
  private val logTag = "WarehouseTransfers"

  suspend fun fetchWarehouseProducts(): List<ProductItem> {
    Log.d(logTag, "Loading products for location ${AppConfig.FILTER_LOCATION_ID}")
    val locationRows = client.get(
      path = "rest/v1/product_locations",
      query = mapOf(
        "select" to "product_id",
        "location_id" to "eq.${AppConfig.FILTER_LOCATION_ID}"
      )
    )

    val locationJson = JSONArray(locationRows)
    val productIds = mutableListOf<String>()
    for (i in 0 until locationJson.length()) {
      val row = locationJson.getJSONObject(i)
      val pid = row.optString("product_id", "")
      if (pid.isNotBlank()) productIds.add(pid)
    }

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
      for (i in 0 until arr.length()) {
        val row = arr.getJSONObject(i)
        val id = row.optString("id", "")
        if (id.isBlank()) continue
        products.add(
          ProductItem(
            id = id,
            name = row.optString("name", ""),
            sku = row.optString("sku", "")
          )
        )
      }
    }
    return products.sortedBy { it.name.lowercase() }
  }

  suspend fun fetchInventoryByLocation(locationId: String, productIds: List<String>): Map<String, Double> {
    if (productIds.isEmpty()) return emptyMap()
    val result = mutableMapOf<String, Double>()
    val chunks = productIds.distinct().chunked(80)
    for (chunk in chunks) {
      val pid = chunk.joinToString(",") { "\"$it\"" }
      val response = client.get(
        path = "rest/v1/inventory",
        query = mapOf(
          "select" to "product_id,quantity",
          "location" to "eq.$locationId",
          "product_id" to "in.($pid)"
        )
      )
      val arr = JSONArray(response)
      for (i in 0 until arr.length()) {
        val row = arr.getJSONObject(i)
        val pidValue = row.optString("product_id", "")
        if (pidValue.isBlank()) continue
        result[pidValue] = row.optDouble("quantity", 0.0)
      }
    }
    return result
  }

  suspend fun submitDelivery(
    idempotencyKey: String,
    userId: Int,
    userEmail: String,
    userName: String,
    capturedAt: String,
    lines: List<TransferLine>
  ): SubmitDeliveryResult {
    val items = JSONArray()
    lines.forEach { line ->
      if (line.qty <= 0) return@forEach
      val kindValue = when (line.kind) {
        LineKind.PRODUCT -> "product"
        LineKind.SET_PARENT -> "set-parent"
        LineKind.SET_COMPONENT -> "set-component"
      }
      val row = JSONObject()
        .put("product_id", line.productId ?: JSONObject.NULL)
        .put("combo_id", line.comboId ?: JSONObject.NULL)
        .put("kind", kindValue)
        .put("name", line.name)
        .put("sku", line.sku ?: JSONObject.NULL)
        .put("quantity", line.qty)
        .put("per_set_qty", if (line.perSetQty > 0) line.perSetQty else JSONObject.NULL)
        .put("max_qty", if (line.maxQty > 0) line.maxQty else JSONObject.NULL)
      items.put(row)
    }
    if (items.length() == 0) {
      throw IllegalStateException("Cart is empty. Scan at least one product.")
    }

    val payload = JSONObject()
      .put("p_idempotency_key", idempotencyKey)
      .put("p_from_location", AppConfig.FROM_LOCATION_ID)
      .put("p_to_location", AppConfig.TO_LOCATION_ID)
      .put("p_created_by_id", userId)
      .put("p_created_by_email", userEmail)
      .put("p_created_by_name", userName.ifBlank { JSONObject.NULL })
      .put("p_items", items)
      .put("p_captured_at", capturedAt)

    val response = client.post(
      path = "rest/v1/rpc/submit_warehouse_delivery",
      bodyJson = payload.toString()
    )

    val root = try {
      JSONObject(response)
    } catch (_: Exception) {
      val arr = JSONArray(response)
      if (arr.length() == 0) throw IllegalStateException("Submit failed.")
      arr.getJSONObject(0)
    }

    if (!root.optBoolean("ok", false)) {
      throw IllegalStateException(root.optString("error", "Submit failed."))
    }
    val session = root.optJSONObject("session")
      ?: throw IllegalStateException("Submit failed: missing session.")
    val id = session.optString("id", "")
    if (id.isBlank()) throw IllegalStateException("Submit failed: missing delivery id.")
    return SubmitDeliveryResult(
      sessionId = id,
      deliveryNumber = session.optString("delivery_number", id),
      duplicate = root.optBoolean("duplicate", false)
    )
  }

  suspend fun fetchCompletedDeliveries(): List<DeliverySessionSummary> {
    val response = client.get(
      path = "rest/v1/warehouse_delivery_sessions",
      query = mapOf(
        "select" to "id,delivery_number,status,submitted_at,completed_at,applied_at,transfer_datetime,created_at,total_qty,pdf_url",
        "from_location" to "eq.${AppConfig.FROM_LOCATION_ID}",
        "to_location" to "eq.${AppConfig.TO_LOCATION_ID}",
        "status" to "in.(completed,accepted)",
        "order" to "delivery_number.desc"
      )
    )
    val arr = JSONArray(response)
    val sessions = mutableListOf<Pair<String, JSONObject>>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      val id = row.optString("id", "")
      if (id.isNotBlank()) sessions.add(id to row)
    }
    if (sessions.isEmpty()) return emptyList()

    val counts = mutableMapOf<String, Int>()
    val idsFilter = sessions.joinToString(",") { it.first }
    val entries = client.get(
      path = "rest/v1/warehouse_delivery_entries",
      query = mapOf(
        "select" to "session_id,kind",
        "session_id" to "in.($idsFilter)"
      )
    )
    val entryArr = JSONArray(entries)
    for (i in 0 until entryArr.length()) {
      val row = entryArr.getJSONObject(i)
      if (row.optString("kind", "product") == "set-parent") continue
      val sid = row.optString("session_id", "")
      if (sid.isBlank()) continue
      counts[sid] = (counts[sid] ?: 0) + 1
    }

    return sessions.map { (id, row) ->
      DeliverySessionSummary(
        id = id,
        deliveryNumber = row.optString("delivery_number", id),
        status = row.optString("status", ""),
        submittedAt = row.nullableString("submitted_at")
          ?: row.nullableString("transfer_datetime")
          ?: row.nullableString("created_at"),
        completedAt = row.nullableString("completed_at")
          ?: row.nullableString("applied_at"),
        totalQty = row.optDouble("total_qty", 0.0),
        productCount = counts[id] ?: 0,
        pdfUrl = row.nullableString("pdf_url")
      )
    }
  }
}

private fun JSONObject.nullableString(key: String): String? {
  if (!has(key) || isNull(key)) return null
  val value = optString(key, "")
  return value.takeIf { it.isNotBlank() }
}
