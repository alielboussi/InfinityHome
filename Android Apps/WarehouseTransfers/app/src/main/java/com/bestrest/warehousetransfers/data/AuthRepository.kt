package com.bestrest.warehousetransfers.data

import com.bestrest.warehousetransfers.models.UserSession
import org.json.JSONArray
import org.json.JSONObject

class AuthRepository(private val client: SupabaseClient) {
  suspend fun login(email: String, password: String): UserSession {
    val payload = JSONObject()
      .put("p_email", email)
      .put("p_password", password)

    val response = client.post(
      path = "rest/v1/rpc/app_login",
      bodyJson = payload.toString()
    )

    val arr = JSONArray(response)
    if (arr.length() == 0) {
      throw IllegalStateException("Invalid email or password.")
    }
    val row = arr.getJSONObject(0)
    val id = row.optInt("id", 0)
    val userEmail = row.optString("email", "")
    val role = row.optString("role", "user")
    val fullName = row.optString("full_name", "")

    if (id == 0 || userEmail.isBlank()) {
      throw IllegalStateException("Login failed. Please try again.")
    }

    return UserSession(
      id = id,
      email = userEmail,
      role = role,
      fullName = fullName
    )
  }
}
