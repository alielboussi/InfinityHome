package com.bestrest.warehousetransfers

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bestrest.warehousetransfers.data.AppConfig
import com.bestrest.warehousetransfers.data.AuthRepository
import com.bestrest.warehousetransfers.data.CartStorage
import com.bestrest.warehousetransfers.data.DeliverySessionSummary
import com.bestrest.warehousetransfers.data.ProductRepository
import com.bestrest.warehousetransfers.data.SupabaseClient
import com.bestrest.warehousetransfers.models.LineKind
import com.bestrest.warehousetransfers.models.ProductItem
import com.bestrest.warehousetransfers.models.TransferLine
import com.bestrest.warehousetransfers.models.UserSession
import com.bestrest.warehousetransfers.ui.theme.IhBlue
import com.bestrest.warehousetransfers.ui.theme.IhBlueStrong
import com.bestrest.warehousetransfers.ui.theme.IhGreen
import com.bestrest.warehousetransfers.ui.theme.IhGreenStrong
import com.bestrest.warehousetransfers.ui.theme.IhRed
import com.bestrest.warehousetransfers.ui.theme.IhWhite
import com.bestrest.warehousetransfers.ui.theme.WarehouseTransfersTheme
import com.google.android.gms.codescanner.GmsBarcodeScannerOptions
import com.google.android.gms.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      WarehouseTransfersTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
          WarehouseTransfersApp()
        }
      }
    }
  }
}

private enum class AppScreen {
  LOGIN,
  DASHBOARD,
  CREATE_TRANSFER,
  CART,
  COMPLETED_DELIVERIES
}

@Composable
fun WarehouseTransfersApp() {
  val context = LocalContext.current
  val client = remember { SupabaseClient() }
  val authRepository = remember { AuthRepository(client) }
  val repository = remember { ProductRepository(client) }
  val cartStorage = remember { CartStorage(context) }
  val scope = rememberCoroutineScope()

  val cart = remember {
    mutableStateListOf<TransferLine>().also { list ->
      list.addAll(cartStorage.loadLines())
    }
  }

  var session by remember { mutableStateOf<UserSession?>(null) }
  var screen by remember { mutableStateOf(AppScreen.LOGIN) }
  var products by remember { mutableStateOf<List<ProductItem>>(emptyList()) }
  var productsLoading by remember { mutableStateOf(false) }
  var productsError by remember { mutableStateOf("") }
  var idempotencyKey by remember { mutableStateOf(cartStorage.loadIdempotencyKey()) }
  var leaveConfirmVisible by remember { mutableStateOf(false) }
  var pendingLeaveScreen by remember { mutableStateOf<AppScreen?>(null) }

  fun persistCart() {
    cartStorage.saveLines(cart.toList())
  }

  fun clearCartSession() {
    cart.clear()
    idempotencyKey = null
    cartStorage.clearAll()
  }

  fun requestLeaveTo(target: AppScreen) {
    if (cart.isNotEmpty() && (screen == AppScreen.CREATE_TRANSFER || screen == AppScreen.CART)) {
      pendingLeaveScreen = target
      leaveConfirmVisible = true
    } else {
      screen = target
    }
  }

  LaunchedEffect(session) {
    if (session == null) return@LaunchedEffect
    productsLoading = true
    productsError = ""
    try {
      products = repository.fetchWarehouseProducts()
    } catch (err: Exception) {
      productsError = err.message ?: "Failed to load products."
    } finally {
      productsLoading = false
    }
  }

  if (leaveConfirmVisible) {
    AlertDialog(
      onDismissRequest = {
        leaveConfirmVisible = false
        pendingLeaveScreen = null
      },
      title = { Text("Leave transfer?") },
      text = {
        Text(
          "You have ${cart.size} item(s) in the cart. " +
            "Leave keeps the cart for later; Discard clears it."
        )
      },
      confirmButton = {
        TextButton(
          onClick = {
            leaveConfirmVisible = false
            val target = pendingLeaveScreen ?: AppScreen.DASHBOARD
            pendingLeaveScreen = null
            screen = target
          }
        ) {
          Text("Leave")
        }
      },
      dismissButton = {
        Row {
          TextButton(
            onClick = {
              leaveConfirmVisible = false
              pendingLeaveScreen = null
            }
          ) {
            Text("Stay")
          }
          TextButton(
            onClick = {
              clearCartSession()
              leaveConfirmVisible = false
              val target = pendingLeaveScreen ?: AppScreen.DASHBOARD
              pendingLeaveScreen = null
              screen = target
            }
          ) {
            Text("Discard cart")
          }
        }
      }
    )
  }

  when {
    session == null || screen == AppScreen.LOGIN -> {
      LoginScreen(
        onLogin = { email, password -> authRepository.login(email, password) },
        onSuccess = { user ->
          session = user
          screen = AppScreen.DASHBOARD
        }
      )
    }

    screen == AppScreen.DASHBOARD -> {
      DashboardScreen(
        session = session!!,
        cartCount = cart.size,
        onCreateTransfer = { screen = AppScreen.CREATE_TRANSFER },
        onCompletedDeliveries = { screen = AppScreen.COMPLETED_DELIVERIES },
        onLogout = {
          session = null
          screen = AppScreen.LOGIN
        }
      )
    }

    screen == AppScreen.CREATE_TRANSFER -> {
      BackHandler { requestLeaveTo(AppScreen.DASHBOARD) }
      CreateTransferScreen(
        products = products,
        productsLoading = productsLoading,
        productsError = productsError,
        cartCount = cart.size,
        onAddOrMerge = { product, qty ->
          val existing = cart.indexOfFirst { it.productId == product.id && it.kind == LineKind.PRODUCT }
          if (existing >= 0) {
            val current = cart[existing]
            cart[existing] = current.copy(qty = current.qty + qty)
          } else {
            cart.add(
              TransferLine(
                id = product.id,
                kind = LineKind.PRODUCT,
                productId = product.id,
                comboId = null,
                name = product.name,
                sku = product.sku,
                qty = qty
              )
            )
          }
          // New cart contents → new submit attempt key on next submit
          idempotencyKey = null
          cartStorage.saveIdempotencyKey(null)
          persistCart()
        },
        onOpenCart = { screen = AppScreen.CART },
        onBack = { requestLeaveTo(AppScreen.DASHBOARD) },
        onRetryLoadProducts = {
          scope.launch {
            productsLoading = true
            productsError = ""
            try {
              products = repository.fetchWarehouseProducts()
            } catch (err: Exception) {
              productsError = err.message ?: "Failed to load products."
            } finally {
              productsLoading = false
            }
          }
        }
      )
    }

    screen == AppScreen.CART -> {
      BackHandler { requestLeaveTo(AppScreen.CREATE_TRANSFER) }
      CartScreen(
        lines = cart.toList(),
        session = session!!,
        repository = repository,
        idempotencyKey = idempotencyKey,
        onIdempotencyKey = { key ->
          idempotencyKey = key
          cartStorage.saveIdempotencyKey(key)
        },
        onUpdateQty = { lineId, newQty ->
          val idx = cart.indexOfFirst { it.id == lineId }
          if (idx >= 0 && newQty >= 1) {
            cart[idx] = cart[idx].copy(qty = newQty)
            idempotencyKey = null
            cartStorage.saveIdempotencyKey(null)
            persistCart()
          }
        },
        onRemove = { lineId ->
          cart.removeAll { it.id == lineId }
          idempotencyKey = null
          cartStorage.saveIdempotencyKey(null)
          persistCart()
        },
        onSubmitSuccess = {
          clearCartSession()
          screen = AppScreen.DASHBOARD
        },
        onBack = { requestLeaveTo(AppScreen.CREATE_TRANSFER) },
        onContinueScanning = { screen = AppScreen.CREATE_TRANSFER }
      )
    }

    screen == AppScreen.COMPLETED_DELIVERIES -> {
      BackHandler { screen = AppScreen.DASHBOARD }
      CompletedDeliveriesScreen(
        repository = repository,
        onBack = { screen = AppScreen.DASHBOARD }
      )
    }
  }
}

@Composable
fun LoginScreen(
  onLogin: suspend (String, String) -> UserSession,
  onSuccess: (UserSession) -> Unit
) {
  val scope = rememberCoroutineScope()
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var loading by remember { mutableStateOf(false) }
  var errorMessage by remember { mutableStateOf("") }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = "Warehouse Transfers",
      style = MaterialTheme.typography.headlineMedium,
      fontWeight = FontWeight.Bold,
      color = IhGreen
    )
    Text(
      text = "${AppConfig.FROM_LOCATION_NAME} → ${AppConfig.TO_LOCATION_NAME}",
      color = IhBlue,
      modifier = Modifier.padding(top = 4.dp)
    )
    Spacer(modifier = Modifier.height(24.dp))
    OutlinedTextField(
      value = email,
      onValueChange = { email = it },
      label = { Text("Email") },
      singleLine = true,
      enabled = !loading,
      modifier = Modifier.fillMaxWidth(),
      colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = IhGreen,
        focusedLabelColor = IhGreen,
        cursorColor = IhGreen
      )
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
      value = password,
      onValueChange = { password = it },
      label = { Text("Password") },
      singleLine = true,
      enabled = !loading,
      visualTransformation = PasswordVisualTransformation(),
      modifier = Modifier.fillMaxWidth(),
      colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = IhGreen,
        focusedLabelColor = IhGreen,
        cursorColor = IhGreen
      )
    )
    if (errorMessage.isNotEmpty()) {
      Spacer(modifier = Modifier.height(8.dp))
      Text(text = errorMessage, color = IhRed)
    }
    Spacer(modifier = Modifier.height(20.dp))
    Button(
      onClick = {
        if (loading) return@Button
        scope.launch {
          loading = true
          errorMessage = ""
          try {
            val user = onLogin(email.trim(), password)
            onSuccess(user)
          } catch (err: Exception) {
            errorMessage = err.message ?: "Login failed."
          } finally {
            loading = false
          }
        }
      },
      enabled = !loading,
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 56.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = IhGreenStrong,
        contentColor = IhWhite
      )
    ) {
      Text(
        text = if (loading) "Signing in..." else "Sign In",
        fontSize = 18.sp
      )
    }
  }
}

@Composable
fun DashboardScreen(
  session: UserSession,
  cartCount: Int,
  onCreateTransfer: () -> Unit,
  onCompletedDeliveries: () -> Unit,
  onLogout: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(
      text = "Warehouse Transfers",
      style = MaterialTheme.typography.headlineMedium,
      fontWeight = FontWeight.Bold,
      color = IhGreen
    )
    Text(
      text = session.fullName.ifBlank { session.email },
      color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f),
      modifier = Modifier.padding(top = 4.dp)
    )
    Text(
      text = "${AppConfig.FROM_LOCATION_NAME} → ${AppConfig.TO_LOCATION_NAME}",
      color = IhBlue,
      fontSize = 14.sp,
      modifier = Modifier.padding(top = 2.dp)
    )
    if (cartCount > 0) {
      Text(
        text = "Cart has $cartCount item(s) saved",
        color = IhGreen,
        modifier = Modifier.padding(top = 8.dp)
      )
    }
    Spacer(modifier = Modifier.height(40.dp))
    Button(
      onClick = onCreateTransfer,
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 72.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = IhGreenStrong,
        contentColor = IhWhite
      )
    ) {
      Text(text = "Create Transfer", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    }
    Spacer(modifier = Modifier.height(16.dp))
    Button(
      onClick = onCompletedDeliveries,
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 72.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = IhBlueStrong,
        contentColor = IhWhite
      )
    ) {
      Text(text = "Completed Deliveries", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    }
    Spacer(modifier = Modifier.height(32.dp))
    TextButton(onClick = onLogout) {
      Text("Sign out", color = IhRed)
    }
  }
}

@Composable
fun CreateTransferScreen(
  products: List<ProductItem>,
  productsLoading: Boolean,
  productsError: String,
  cartCount: Int,
  onAddOrMerge: (ProductItem, Int) -> Unit,
  onOpenCart: () -> Unit,
  onBack: () -> Unit,
  onRetryLoadProducts: () -> Unit
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  var scanBusy by remember { mutableStateOf(false) }
  var confirmBusy by remember { mutableStateOf(false) }
  var pendingProduct by remember { mutableStateOf<ProductItem?>(null) }
  var qtyInput by remember { mutableStateOf("1") }
  var qtyError by remember { mutableStateOf("") }
  var showFallbackSearch by remember { mutableStateOf(false) }
  var searchText by remember { mutableStateOf("") }
  var scanTrigger by remember { mutableStateOf(0) }

  val scannerOptions = remember {
    GmsBarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_CODE_128)
      .enableAutoZoom()
      .build()
  }
  val scanner = remember(context) { GmsBarcodeScanning.getClient(context, scannerOptions) }

  fun resolveProduct(raw: String): ProductItem? {
    val q = raw.trim()
    if (q.isBlank()) return null
    val lower = q.lowercase(Locale.getDefault())
    products.firstOrNull { it.sku?.equals(q, ignoreCase = true) == true }?.let { return it }
    products.firstOrNull { it.name.equals(q, ignoreCase = true) }?.let { return it }
    products.firstOrNull { it.sku?.lowercase(Locale.getDefault())?.contains(lower) == true }?.let { return it }
    products.firstOrNull { it.name.lowercase(Locale.getDefault()).contains(lower) }?.let { return it }
    return null
  }

  fun openScanner() {
    if (scanBusy || pendingProduct != null || productsLoading) return
    if (products.isEmpty() && productsError.isNotEmpty()) {
      Toast.makeText(context, "Load products before scanning.", Toast.LENGTH_SHORT).show()
      return
    }
    scanBusy = true
    scanner.startScan()
      .addOnSuccessListener { barcode ->
        val scanned = barcode.rawValue?.trim().orEmpty()
        if (scanned.isBlank()) {
          Toast.makeText(context, "No Code 128 value detected.", Toast.LENGTH_SHORT).show()
          return@addOnSuccessListener
        }
        val match = resolveProduct(scanned)
        if (match == null) {
          Toast.makeText(context, "No product match for \"$scanned\"", Toast.LENGTH_LONG).show()
        } else {
          pendingProduct = match
          qtyInput = "1"
          qtyError = ""
          confirmBusy = false
        }
      }
      .addOnFailureListener { err ->
        val msg = err.message?.takeIf { it.isNotBlank() } ?: "Scan failed."
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
      }
      .addOnCanceledListener {
        // User closed scanner — stay on create screen
      }
      .addOnCompleteListener {
        scanBusy = false
      }
  }

  // Auto-open scanner on enter and after each confirmed add
  LaunchedEffect(scanTrigger, productsLoading, products) {
    if (!productsLoading && pendingProduct == null) {
      openScanner()
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically
    ) {
      TextButton(onClick = onBack) { Text("Back") }
      Spacer(modifier = Modifier.weight(1f))
      Text(
        text = "Scan products",
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground
      )
      Spacer(modifier = Modifier.weight(1f))
      Spacer(modifier = Modifier.width(48.dp))
    }

    Text(
      text = "${AppConfig.FROM_LOCATION_NAME} → ${AppConfig.TO_LOCATION_NAME}",
      color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
      modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
    )

    if (productsLoading) {
      Box(
        modifier = Modifier
          .weight(1f)
          .fillMaxWidth(),
        contentAlignment = Alignment.Center
      ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          CircularProgressIndicator()
          Spacer(modifier = Modifier.height(12.dp))
          Text("Loading products…")
        }
      }
    } else {
      Column(
        modifier = Modifier
          .weight(1f)
          .fillMaxWidth(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
      ) {
        if (productsError.isNotEmpty()) {
          Text(text = productsError, color = MaterialTheme.colorScheme.error)
          Spacer(modifier = Modifier.height(12.dp))
          Button(onClick = onRetryLoadProducts) { Text("Retry load") }
        } else {
          Text(
            text = if (scanBusy) "Scanner open…" else "Point the scanner at a Code 128 barcode",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 18.sp,
            modifier = Modifier.padding(horizontal = 16.dp)
          )
          Spacer(modifier = Modifier.height(20.dp))
          Button(
            onClick = { scanTrigger += 1 },
            enabled = !scanBusy && pendingProduct == null,
            modifier = Modifier
              .fillMaxWidth()
              .heightIn(min = 64.dp)
          ) {
            Text(
              text = if (scanBusy) "Scanning…" else "Scan again",
              fontSize = 18.sp
            )
          }
          Spacer(modifier = Modifier.height(12.dp))
          TextButton(onClick = { showFallbackSearch = !showFallbackSearch }) {
            Text(if (showFallbackSearch) "Hide search" else "Find manually")
          }
          if (showFallbackSearch) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
              value = searchText,
              onValueChange = { searchText = it },
              label = { Text("SKU or name") },
              singleLine = true,
              modifier = Modifier.fillMaxWidth()
            )
            val q = searchText.trim().lowercase(Locale.getDefault())
            val hits = if (q.length < 2) emptyList() else products.filter {
              it.name.lowercase(Locale.getDefault()).contains(q) ||
                (it.sku?.lowercase(Locale.getDefault())?.contains(q) == true)
            }.take(8)
            hits.forEach { product ->
              TextButton(
                onClick = {
                  pendingProduct = product
                  qtyInput = "1"
                  qtyError = ""
                  searchText = ""
                  showFallbackSearch = false
                },
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(
                  text = "${product.name}${if (!product.sku.isNullOrBlank()) " (${product.sku})" else ""}",
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            }
          }
        }
      }
    }

    Button(
      onClick = onOpenCart,
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 72.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = IhBlueStrong,
        contentColor = IhWhite
      )
    ) {
      Text(
        text = if (cartCount > 0) "Open Cart ($cartCount)" else "Open Cart",
        fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold
      )
    }
  }

  val productForQty = pendingProduct
  if (productForQty != null) {
    AlertDialog(
      onDismissRequest = {
        if (!confirmBusy) {
          pendingProduct = null
          scanTrigger += 1
        }
      },
      title = { Text("Quantity") },
      text = {
        Column {
          Text(
            text = productForQty.name,
            fontWeight = FontWeight.SemiBold,
            fontSize = 18.sp
          )
          if (!productForQty.sku.isNullOrBlank()) {
            Text(
              text = "SKU: ${productForQty.sku}",
              color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
              modifier = Modifier.padding(top = 4.dp)
            )
          }
          Spacer(modifier = Modifier.height(12.dp))
          OutlinedTextField(
            value = qtyInput,
            onValueChange = {
              qtyInput = it.filter { ch -> ch.isDigit() }
              qtyError = ""
            },
            label = { Text("Quantity") },
            singleLine = true,
            enabled = !confirmBusy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth()
          )
          if (qtyError.isNotEmpty()) {
            Text(
              text = qtyError,
              color = MaterialTheme.colorScheme.error,
              modifier = Modifier.padding(top = 6.dp)
            )
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (confirmBusy) return@Button
            val qty = qtyInput.toIntOrNull()
            if (qty == null || qty <= 0) {
              qtyError = "Enter a positive whole number."
              return@Button
            }
            confirmBusy = true
            onAddOrMerge(productForQty, qty)
            Toast.makeText(context, "Added ${productForQty.name} × $qty", Toast.LENGTH_SHORT).show()
            pendingProduct = null
            confirmBusy = false
            scope.launch {
              // Re-open scanner after confirm
              scanTrigger += 1
            }
          },
          enabled = !confirmBusy,
          colors = ButtonDefaults.buttonColors(
            containerColor = IhGreenStrong,
            contentColor = IhWhite
          )
        ) {
          Text(if (confirmBusy) "…" else "Confirm")
        }
      },
      dismissButton = {
        TextButton(
          onClick = {
            if (confirmBusy) return@TextButton
            pendingProduct = null
            scanTrigger += 1
          },
          enabled = !confirmBusy
        ) {
          Text("Cancel")
        }
      }
    )
  }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CartScreen(
  lines: List<TransferLine>,
  session: UserSession,
  repository: ProductRepository,
  idempotencyKey: String?,
  onIdempotencyKey: (String) -> Unit,
  onUpdateQty: (String, Int) -> Unit,
  onRemove: (String) -> Unit,
  onSubmitSuccess: () -> Unit,
  onBack: () -> Unit,
  onContinueScanning: () -> Unit
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var submitting by remember { mutableStateOf(false) }
  var submitError by remember { mutableStateOf("") }
  var deleteTarget by remember { mutableStateOf<TransferLine?>(null) }

  fun submitDelivery() {
    if (submitting || lines.isEmpty()) return
    scope.launch {
      submitting = true
      submitError = ""
      try {
        val key = idempotencyKey ?: UUID.randomUUID().toString().also { onIdempotencyKey(it) }
        val capturedAt = formatIsoTimestampLusaka(Date())
        val result = repository.submitDelivery(
          idempotencyKey = key,
          userId = session.id,
          userEmail = session.email,
          userName = session.fullName,
          capturedAt = capturedAt,
          lines = lines
        )
        val msg = if (result.duplicate) {
          "Already submitted (${result.deliveryNumber})"
        } else {
          "Delivery ${result.deliveryNumber} submitted"
        }
        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        onSubmitSuccess()
      } catch (err: Exception) {
        submitError = err.message ?: "Submit failed."
        Toast.makeText(context, submitError, Toast.LENGTH_LONG).show()
      } finally {
        submitting = false
      }
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically
    ) {
      TextButton(onClick = onBack, enabled = !submitting) { Text("Back") }
      Spacer(modifier = Modifier.weight(1f))
      Text(
        text = "Cart",
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground
      )
      Spacer(modifier = Modifier.weight(1f))
      TextButton(onClick = onContinueScanning, enabled = !submitting) {
        Text("Scan")
      }
    }

    Spacer(modifier = Modifier.height(8.dp))

    if (lines.isEmpty()) {
      Box(
        modifier = Modifier
          .weight(1f)
          .fillMaxWidth(),
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = "Cart is empty. Scan products to add items.",
          color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
          fontSize = 16.sp
        )
      }
    } else {
      LazyColumn(
        modifier = Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(vertical = 8.dp)
      ) {
        items(lines, key = { it.id }) { line ->
          Card(
            modifier = Modifier
              .fillMaxWidth()
              .combinedClickable(
                onClick = {},
                onLongClick = {
                  if (!submitting) deleteTarget = line
                }
              ),
            colors = CardDefaults.cardColors(
              containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
          ) {
            Column(modifier = Modifier.padding(14.dp)) {
              Text(
                text = line.name,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
              )
              Text(
                text = "SKU: ${line.sku ?: "—"}",
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                fontSize = 14.sp
              )
              Spacer(modifier = Modifier.height(8.dp))
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
              ) {
                OutlinedButton(
                  onClick = { onUpdateQty(line.id, (line.qty - 1).coerceAtLeast(1)) },
                  enabled = !submitting && line.qty > 1
                ) {
                  Text("−", fontSize = 20.sp)
                }
                Text(
                  text = line.qty.toString(),
                  fontSize = 20.sp,
                  fontWeight = FontWeight.Bold,
                  modifier = Modifier.width(40.dp)
                )
                OutlinedButton(
                  onClick = { onUpdateQty(line.id, line.qty + 1) },
                  enabled = !submitting
                ) {
                  Text("+", fontSize = 20.sp)
                }
              }
              Text(
                text = "Long-press to remove",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.padding(top = 6.dp)
              )
            }
          }
        }
      }
    }

    if (submitError.isNotEmpty()) {
      Text(
        text = submitError,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(vertical = 8.dp)
      )
      Button(
        onClick = { submitDelivery() },
        enabled = !submitting && lines.isNotEmpty(),
        modifier = Modifier
          .fillMaxWidth()
          .heightIn(min = 56.dp),
        colors = ButtonDefaults.buttonColors(
          containerColor = IhBlueStrong,
          contentColor = IhWhite
        )
      ) {
        Text(text = if (submitting) "Retrying…" else "Retry", fontSize = 18.sp)
      }
      Spacer(modifier = Modifier.height(8.dp))
    }

    Button(
      onClick = { submitDelivery() },
      enabled = !submitting && lines.isNotEmpty(),
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 72.dp),
      colors = ButtonDefaults.buttonColors(
        containerColor = IhGreenStrong,
        contentColor = IhWhite,
        disabledContainerColor = IhGreenStrong.copy(alpha = 0.35f),
        disabledContentColor = IhWhite.copy(alpha = 0.7f)
      )
    ) {
      Text(
        text = if (submitting) "Submitting…" else "Submit Delivery",
        fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold
      )
    }
  }

  val toDelete = deleteTarget
  if (toDelete != null) {
    AlertDialog(
      onDismissRequest = { deleteTarget = null },
      title = { Text("Remove item?") },
      text = { Text("Remove \"${toDelete.name}\" from the cart?") },
      confirmButton = {
        Button(
          onClick = {
            onRemove(toDelete.id)
            deleteTarget = null
          }
        ) {
          Text("Remove")
        }
      },
      dismissButton = {
        TextButton(onClick = { deleteTarget = null }) {
          Text("Cancel")
        }
      }
    )
  }
}

@Composable
fun CompletedDeliveriesScreen(
  repository: ProductRepository,
  onBack: () -> Unit
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf("") }
  var deliveries by remember { mutableStateOf<List<DeliverySessionSummary>>(emptyList()) }

  fun reload() {
    scope.launch {
      loading = true
      error = ""
      try {
        deliveries = repository.fetchCompletedDeliveries()
      } catch (err: Exception) {
        error = err.message ?: "Failed to load deliveries."
      } finally {
        loading = false
      }
    }
  }

  LaunchedEffect(Unit) { reload() }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically
    ) {
      TextButton(onClick = onBack) { Text("Back") }
      Spacer(modifier = Modifier.weight(1f))
      Text(
        text = "Completed Deliveries",
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground
      )
      Spacer(modifier = Modifier.weight(1f))
      TextButton(onClick = { reload() }, enabled = !loading) {
        Text("Refresh")
      }
    }

    Spacer(modifier = Modifier.height(8.dp))

    when {
      loading -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          CircularProgressIndicator()
        }
      }
      error.isNotEmpty() -> {
        Column(
          modifier = Modifier.fillMaxSize(),
          verticalArrangement = Arrangement.Center,
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Text(text = error, color = MaterialTheme.colorScheme.error)
          Spacer(modifier = Modifier.height(12.dp))
          Button(onClick = { reload() }) { Text("Retry") }
        }
      }
      deliveries.isEmpty() -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Text(
            text = "No completed deliveries yet.",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
          )
        }
      }
      else -> {
        LazyColumn(
          verticalArrangement = Arrangement.spacedBy(10.dp),
          contentPadding = PaddingValues(vertical = 8.dp)
        ) {
          items(deliveries, key = { it.id }) { delivery ->
            Card(
              modifier = Modifier.fillMaxWidth(),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
              )
            ) {
              Column(modifier = Modifier.padding(16.dp)) {
                Text(
                  text = delivery.deliveryNumber,
                  fontWeight = FontWeight.Bold,
                  fontSize = 18.sp
                )
                Text(
                  text = "Status: ${delivery.status}",
                  modifier = Modifier.padding(top = 4.dp)
                )
                Text(
                  text = "Submitted: ${formatDisplayTimestamp(delivery.submittedAt)}",
                  color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                  fontSize = 14.sp
                )
                Text(
                  text = "Completed: ${formatDisplayTimestamp(delivery.completedAt)}",
                  color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                  fontSize = 14.sp
                )
                Text(
                  text = "Products: ${delivery.productCount}  ·  Qty: ${formatQty(delivery.totalQty)}",
                  modifier = Modifier.padding(top = 4.dp)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Button(
                  onClick = {
                    val url = delivery.pdfUrl
                    if (!url.isNullOrBlank()) {
                      try {
                        context.startActivity(
                          Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        )
                      } catch (_: Exception) {
                        Toast.makeText(context, "Unable to open PDF.", Toast.LENGTH_SHORT).show()
                      }
                    } else {
                      Toast.makeText(
                        context,
                        "PDF is available after acceptance on the web / generate note.",
                        Toast.LENGTH_LONG
                      ).show()
                    }
                  },
                  modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                ) {
                  Text("PDF")
                }
              }
            }
          }
        }
      }
    }
  }
}

private fun formatIsoTimestampLusaka(date: Date): String {
  val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
  fmt.timeZone = TimeZone.getTimeZone("Africa/Lusaka")
  return fmt.format(date)
}

private fun formatDisplayTimestamp(raw: String?): String {
  if (raw.isNullOrBlank()) return "—"
  return try {
    val parsers = listOf(
      "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX",
      "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
      "yyyy-MM-dd'T'HH:mm:ssXXX",
      "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      "yyyy-MM-dd'T'HH:mm:ss'Z'",
      "yyyy-MM-dd HH:mm:ss"
    )
    var parsed: Date? = null
    for (pattern in parsers) {
      try {
        val p = SimpleDateFormat(pattern, Locale.US)
        p.timeZone = TimeZone.getTimeZone("UTC")
        parsed = p.parse(raw)
        if (parsed != null) break
      } catch (_: Exception) {
        // try next
      }
    }
    if (parsed == null) return raw
    val out = SimpleDateFormat("dd MMM yyyy HH:mm", Locale.getDefault())
    out.timeZone = TimeZone.getTimeZone("Africa/Lusaka")
    out.format(parsed)
  } catch (_: Exception) {
    raw
  }
}

private fun formatQty(value: Double): String {
  return if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
}
