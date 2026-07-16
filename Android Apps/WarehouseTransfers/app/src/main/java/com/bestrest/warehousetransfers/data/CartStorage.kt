package com.bestrest.warehousetransfers.data

import android.content.Context
import com.bestrest.warehousetransfers.models.LineKind
import com.bestrest.warehousetransfers.models.TransferLine
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists cart lines (and submit idempotency key) across temporary process death.
 */
class CartStorage(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun saveLines(lines: List<TransferLine>) {
    val arr = JSONArray()
    lines.forEach { line ->
      arr.put(
        JSONObject()
          .put("id", line.id)
          .put("kind", line.kind.name)
          .put("productId", line.productId)
          .put("comboId", line.comboId)
          .put("name", line.name)
          .put("sku", line.sku)
          .put("qty", line.qty)
          .put("perSetQty", line.perSetQty)
          .put("maxQty", line.maxQty)
      )
    }
    prefs.edit().putString(KEY_LINES, arr.toString()).apply()
  }

  fun loadLines(): List<TransferLine> {
    val raw = prefs.getString(KEY_LINES, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      val out = mutableListOf<TransferLine>()
      for (i in 0 until arr.length()) {
        val row = arr.getJSONObject(i)
        val productId = row.optString("productId", "").takeIf { it.isNotBlank() }
        val name = row.optString("name", "")
        val qty = row.optInt("qty", 0)
        if (name.isBlank() || qty <= 0) continue
        val kind = try {
          LineKind.valueOf(row.optString("kind", LineKind.PRODUCT.name))
        } catch (_: Exception) {
          LineKind.PRODUCT
        }
        out.add(
          TransferLine(
            id = row.optString("id", productId ?: java.util.UUID.randomUUID().toString()),
            kind = kind,
            productId = productId,
            comboId = if (row.isNull("comboId")) null else row.optInt("comboId"),
            name = name,
            sku = row.optString("sku", "").takeIf { it.isNotBlank() },
            qty = qty,
            perSetQty = row.optInt("perSetQty", 0),
            maxQty = row.optInt("maxQty", 0)
          )
        )
      }
      out
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun clearLines() {
    prefs.edit().remove(KEY_LINES).apply()
  }

  fun saveIdempotencyKey(key: String?) {
    if (key.isNullOrBlank()) {
      prefs.edit().remove(KEY_IDEMPOTENCY).apply()
    } else {
      prefs.edit().putString(KEY_IDEMPOTENCY, key).apply()
    }
  }

  fun loadIdempotencyKey(): String? {
    return prefs.getString(KEY_IDEMPOTENCY, null)?.takeIf { it.isNotBlank() }
  }

  fun clearAll() {
    prefs.edit().clear().apply()
  }

  companion object {
    private const val PREFS_NAME = "warehouse_transfer_cart"
    private const val KEY_LINES = "cart_lines_json"
    private const val KEY_IDEMPOTENCY = "submit_idempotency_key"
  }
}
