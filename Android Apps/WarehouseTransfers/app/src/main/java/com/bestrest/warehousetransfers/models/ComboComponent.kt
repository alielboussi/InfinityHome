package com.bestrest.warehousetransfers.models

data class ComboComponent(
  val comboId: Int,
  val productId: String,
  val name: String,
  val sku: String?,
  val perSetQty: Int
)
