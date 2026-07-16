package com.bestrest.warehousetransfers.models

enum class LineKind {
  PRODUCT,
  SET_PARENT,
  SET_COMPONENT
}

/**
 * Cart / delivery line.
 * Employee guided flow uses [LineKind.PRODUCT] with [productId], [name], [sku], [qty].
 * SET_* kinds remain for API compatibility with submit_warehouse_delivery.
 */
data class TransferLine(
  val id: String,
  val kind: LineKind,
  val productId: String?,
  val comboId: Int?,
  val name: String,
  val sku: String?,
  val qty: Int,
  val perSetQty: Int = 0,
  val maxQty: Int = 0
)
