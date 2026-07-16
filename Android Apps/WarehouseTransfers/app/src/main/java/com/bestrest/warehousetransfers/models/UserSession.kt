package com.bestrest.warehousetransfers.models

data class UserSession(
  val id: Int,
  val email: String,
  val role: String,
  val fullName: String
)
