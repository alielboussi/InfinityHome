package com.bestrest.factoryproduction.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType

class SupabaseClient {
  companion object {
    private const val TAG = "SupabaseClient"
  }

  private val client = OkHttpClient()
  private val baseUrl = AppConfig.SUPABASE_URL.toHttpUrl()
  private val jsonType = "application/json".toMediaType()

  suspend fun get(path: String, query: Map<String, String>): String = withContext(Dispatchers.IO) {
    val urlBuilder = baseUrl.newBuilder()
      .addPathSegments(path.trimStart('/'))

    query.forEach { (key, value) ->
      urlBuilder.addQueryParameter(key, value)
    }

    val request = Request.Builder()
      .url(urlBuilder.build())
      .get()
      .addHeader("apikey", AppConfig.SUPABASE_ANON_KEY)
      .addHeader("Authorization", "Bearer ${AppConfig.SUPABASE_ANON_KEY}")
      .addHeader("Accept", "application/json")
      .build()

    client.newCall(request).execute().use { response ->
      val body = response.body?.string()
      if (!response.isSuccessful) {
        Log.e(TAG, "GET ${urlBuilder.build()} failed: HTTP ${response.code} ${response.message} body=${body}")
        throw IllegalStateException("HTTP ${response.code}: ${response.message} ${body ?: ""}".trim())
      }
      body ?: "[]"
    }
  }

  suspend fun post(path: String, bodyJson: String, prefer: String? = null): String = withContext(Dispatchers.IO) {
    val normalizedPath = path.trimStart('/')
    if (normalizedPath.startsWith("rest/v1/label_print_jobs")) {
      val msg = "Direct label_print_jobs inserts are blocked. Use /api/label-print-job."
      Log.e(TAG, "Blocked POST ${normalizedPath}: ${msg}")
      throw IllegalStateException(msg)
    }

    val url = baseUrl.newBuilder()
      .addPathSegments(normalizedPath)
      .build()

    val reqBuilder = Request.Builder()
      .url(url)
      .post(bodyJson.toRequestBody(jsonType))
      .addHeader("apikey", AppConfig.SUPABASE_ANON_KEY)
      .addHeader("Authorization", "Bearer ${AppConfig.SUPABASE_ANON_KEY}")
      .addHeader("Accept", "application/json")
      .addHeader("Content-Type", "application/json")

    if (!prefer.isNullOrBlank()) {
      reqBuilder.addHeader("Prefer", prefer)
    }

    val request = reqBuilder.build()

    Log.d(TAG, "POST ${url} body=${bodyJson}")

    client.newCall(request).execute().use { response ->
      val body = response.body?.string()
      if (!response.isSuccessful) {
        Log.e(TAG, "POST ${url} failed: HTTP ${response.code} ${response.message} body=${body}")
        throw IllegalStateException("HTTP ${response.code}: ${response.message} ${body ?: ""}".trim())
      }
      body ?: "[]"
    }
  }

  suspend fun patch(path: String, bodyJson: String, query: Map<String, String>? = null): String = withContext(Dispatchers.IO) {
    val urlBuilder = baseUrl.newBuilder()
      .addPathSegments(path.trimStart('/'))

    query?.forEach { (key, value) ->
      urlBuilder.addQueryParameter(key, value)
    }

    val url = urlBuilder.build()

    val request = Request.Builder()
      .url(url)
      .patch(bodyJson.toRequestBody(jsonType))
      .addHeader("apikey", AppConfig.SUPABASE_ANON_KEY)
      .addHeader("Authorization", "Bearer ${AppConfig.SUPABASE_ANON_KEY}")
      .addHeader("Accept", "application/json")
      .addHeader("Content-Type", "application/json")
      .build()

    Log.d(TAG, "PATCH ${url} body=${bodyJson}")

    client.newCall(request).execute().use { response ->
      val body = response.body?.string()
      if (!response.isSuccessful) {
        Log.e(TAG, "PATCH ${url} failed: HTTP ${response.code} ${response.message} body=${body}")
        throw IllegalStateException("HTTP ${response.code}: ${response.message} ${body ?: ""}".trim())
      }
      return@use body ?: "[]"
    }
  }
}
