package com.bestrest.factoryproduction

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bestrest.factoryproduction.data.AppConfig
import com.bestrest.factoryproduction.data.AuthRepository
import com.bestrest.factoryproduction.data.LabelJobState
import com.bestrest.factoryproduction.data.PrintJobHistoryItem
import com.bestrest.factoryproduction.data.ProductRepository
import com.bestrest.factoryproduction.data.SupabaseClient
import com.bestrest.factoryproduction.models.CategoryItem
import com.bestrest.factoryproduction.models.CartItem
import com.bestrest.factoryproduction.models.ProductItem
import com.bestrest.factoryproduction.models.UnitItem
import com.bestrest.factoryproduction.models.UserSession
import com.bestrest.factoryproduction.ui.theme.CarpentryTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      CarpentryTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
          FactoryProductionScreen()
        }
      }
    }
  }
}

@Composable
fun FactoryProductionScreen() {
  val context = LocalContext.current
  val logTag = "FactoryProduction"
  val client = remember { SupabaseClient() }
  val authRepository = remember { AuthRepository(client) }
  val repository = remember { ProductRepository(client) }
  val scope = rememberCoroutineScope()
  val cartItems = remember { mutableStateListOf<CartItem>() }

  var session by remember { mutableStateOf<UserSession?>(null) }
  var products by remember { mutableStateOf<List<ProductItem>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var errorMessage by remember { mutableStateOf("") }
  var searchText by remember { mutableStateOf("") }


  var showQtyDialog by remember { mutableStateOf(false) }
  var qtyInput by remember { mutableStateOf("1") }
  var selectedProduct by remember { mutableStateOf<ProductItem?>(null) }

  var showAddDialog by remember { mutableStateOf(false) }
  var addName by remember { mutableStateOf("") }
  var addCategoryId by remember { mutableStateOf<Int?>(null) }
  var addUnitId by remember { mutableStateOf<Int?>(null) }
  var addLoading by remember { mutableStateOf(false) }
  var addError by remember { mutableStateOf("") }
  var categories by remember { mutableStateOf<List<CategoryItem>>(emptyList()) }
  var units by remember { mutableStateOf<List<UnitItem>>(emptyList()) }
  var categoryMenuExpanded by remember { mutableStateOf(false) }
  var unitMenuExpanded by remember { mutableStateOf(false) }

  var showSummary by remember { mutableStateOf(false) }
  var pendingTransferNumber by remember { mutableStateOf("") }
  var showSuccess by remember { mutableStateOf(false) }
  var successTransferNumber by remember { mutableStateOf("") }
  var successSessionId by remember { mutableStateOf("") }
  var successPrintStatus by remember { mutableStateOf("") }
  var showHistory by remember { mutableStateOf(false) }
  var pendingSetSuggestions by remember { mutableStateOf<List<String>>(emptyList()) }
  var showSetSuggestionDialog by remember { mutableStateOf(false) }

  var showEditDialog by remember { mutableStateOf(false) }
  var editCartItem by remember { mutableStateOf<CartItem?>(null) }
  var editQtyInput by remember { mutableStateOf("1") }

  var dateText by remember { mutableStateOf("") }
  var timeText by remember { mutableStateOf("") }

  LaunchedEffect(session) {
    if (session == null) return@LaunchedEffect
    while (true) {
      val tz = TimeZone.getTimeZone("GMT+2")
      val dateFmt = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
      val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
      dateFmt.timeZone = tz
      timeFmt.timeZone = tz
      val now = Date()
      dateText = dateFmt.format(now)
      timeText = timeFmt.format(now)
      delay(1000)
    }
  }

  LaunchedEffect(session) {
    if (session == null) return@LaunchedEffect
    loading = true
    errorMessage = ""
    try {
      products = repository.fetchCarpentryProducts()
      Log.d(logTag, "Loaded ${products.size} products")
    } catch (err: Exception) {
      Log.e(logTag, "Failed to load products", err)
      errorMessage = err.message ?: "Failed to load products."
    } finally {
      loading = false
    }
  }

  LaunchedEffect(showSummary) {
    if (!showSummary) return@LaunchedEffect
    if (pendingTransferNumber.isNotBlank()) return@LaunchedEffect
    try {
      pendingTransferNumber = repository.getNextTransferNumber()
    } catch (_: Exception) {
    }
  }

  LaunchedEffect(showAddDialog) {
    if (!showAddDialog) return@LaunchedEffect
    try {
      if (categories.isEmpty()) {
        categories = repository.fetchCategories()
      }
      if (units.isEmpty()) {
        units = repository.fetchUnits()
      }
      Log.d(logTag, "Loaded categories=${categories.size} units=${units.size}")
    } catch (err: Exception) {
      addError = err.message ?: "Failed to load categories or units."
    }
  }

  val filtered = remember(searchText, products) {
    if (searchText.isBlank()) {
      emptyList()
    } else {
      val q = searchText.trim().lowercase(Locale.getDefault())
      products.filter { p ->
        p.name.lowercase(Locale.getDefault()).contains(q) || (p.sku?.lowercase(Locale.getDefault())?.contains(q) ?: false)
      }
    }
  }

  if (session == null) {
    LoginScreen(
      onLogin = { email, password -> authRepository.login(email, password) },
      onSuccess = {
        session = it
        cartItems.clear()
      }
    )
    return
  }

  if (showSummary) {
    SummaryScreen(
      cartItems = cartItems.toList(),
      session = session!!,
      repository = repository,
      transferNumber = pendingTransferNumber,
      onBack = {
        showSummary = false
        pendingTransferNumber = ""
      },
      onApproved = { sessionId, transferNumber, setSuggestions ->
        successSessionId = sessionId
        successTransferNumber = transferNumber
        pendingSetSuggestions = setSuggestions
        showSetSuggestionDialog = setSuggestions.isNotEmpty()
        showSummary = false
        showSuccess = true
        pendingTransferNumber = ""
        cartItems.clear()
      },
      onPrintStatusUpdate = { status ->
        successPrintStatus = status
      }
    )
    return
  }

  if (showHistory) {
    PrintHistoryScreen(
      repository = repository,
      onBack = { showHistory = false }
    )
    return
  }

  if (showSuccess) {
    ApprovalSuccessScreen(
      transferNumber = successTransferNumber,
      sessionId = successSessionId,
      printStatus = successPrintStatus,
      onNewEntry = {
        showSuccess = false
        successTransferNumber = ""
        successSessionId = ""
        successPrintStatus = ""
        searchText = ""
        cartItems.clear()
      },
      onBack = {
        showSuccess = false
        successTransferNumber = ""
        successSessionId = ""
        successPrintStatus = ""
      }
    )
    return
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Box(modifier = Modifier.fillMaxWidth()) {
      Text(
        text = "Factory Production",
        style = MaterialTheme.typography.headlineSmall,
        color = MaterialTheme.colorScheme.onBackground,
        textAlign = TextAlign.Center,
        modifier = Modifier.align(Alignment.Center)
      )
      Button(
        onClick = { showHistory = true },
        modifier = Modifier
          .align(Alignment.CenterEnd)
          .height(40.dp)
      ) {
        Text(text = "History")
      }
    }

    Text(
      text = session!!.fullName,
      color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
      textAlign = TextAlign.Center,
      modifier = Modifier.fillMaxWidth()
    )

    Spacer(modifier = Modifier.height(12.dp))

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Column(modifier = Modifier.weight(1f)) {
        Text(text = "From", color = MaterialTheme.colorScheme.onBackground)
        Text(text = "Carpentry", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      }
      Column(modifier = Modifier.weight(1f)) {
        Text(text = "To", color = MaterialTheme.colorScheme.onBackground)
        Text(text = "Factory Warehouse", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      }
    }

    Spacer(modifier = Modifier.height(10.dp))

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Column(modifier = Modifier.weight(1f)) {
        Text(text = "Date", color = MaterialTheme.colorScheme.onBackground)
        Text(text = dateText, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      }
      Column(modifier = Modifier.weight(1f)) {
        Text(text = "Time", color = MaterialTheme.colorScheme.onBackground)
        Text(text = timeText, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      }
    }

    Spacer(modifier = Modifier.height(14.dp))

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      OutlinedTextField(
        value = searchText,
        onValueChange = { searchText = it },
        modifier = Modifier.weight(1f),
        label = { Text("Search products") },
        singleLine = true
      )
      Button(
        onClick = { showAddDialog = true },
        modifier = Modifier
          .align(Alignment.CenterVertically)
          .width(64.dp)
          .height(56.dp)
      ) {
        Text(text = "+")
      }
    }

    if (loading) {
      Spacer(modifier = Modifier.height(12.dp))
      Text(text = "Loading products...", color = MaterialTheme.colorScheme.onBackground)
    }

    if (errorMessage.isNotEmpty()) {
      Spacer(modifier = Modifier.height(12.dp))
      Text(text = errorMessage, color = MaterialTheme.colorScheme.onBackground)
      Spacer(modifier = Modifier.height(8.dp))
      Button(onClick = {
        scope.launch {
          loading = true
          errorMessage = ""
          try {
            products = repository.fetchCarpentryProducts()
            Log.d(logTag, "Reloaded ${products.size} products")
          } catch (err: Exception) {
            Log.e(logTag, "Failed to reload products", err)
            errorMessage = err.message ?: "Failed to load products."
          } finally {
            loading = false
          }
        }
      }) {
        Text(text = "Retry")
      }
    }

    Spacer(modifier = Modifier.height(12.dp))

    if (filtered.isNotEmpty()) {
      Text(text = "Results", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
      Spacer(modifier = Modifier.height(6.dp))
      LazyColumn(
        modifier = Modifier
          .fillMaxWidth()
          .heightIn(max = 220.dp)
      ) {
        items(filtered) { item ->
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clickable {
                selectedProduct = item
                qtyInput = "1"
                showQtyDialog = true
              }
              .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column(modifier = Modifier.weight(1f)) {
              Text(
                text = item.name,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
              val sku = item.sku
              if (!sku.isNullOrBlank()) {
                Text(
                  text = sku,
                  color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            }
            Text(
              text = "Tap",
              color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
      }
    } else if (searchText.isNotBlank() && !loading && errorMessage.isEmpty()) {
      Text(text = "No matching products.", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
    }

    Spacer(modifier = Modifier.height(10.dp))

    Text(text = "Cart", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
    Spacer(modifier = Modifier.height(6.dp))

    LazyColumn(modifier = Modifier.weight(1f)) {
      items(cartItems) { item ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clickable {
              editCartItem = item
              editQtyInput = item.qty.toString()
              showEditDialog = true
            }
            .padding(vertical = 6.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = item.product.name,
              color = MaterialTheme.colorScheme.onBackground,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
            val sku = item.product.sku
            if (!sku.isNullOrBlank()) {
              Text(
                text = sku,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            }
          }
          Text(
            text = "Qty: ${item.qty}",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }
      }
    }

    Spacer(modifier = Modifier.height(8.dp))
    Button(
      onClick = { showSummary = true },
      enabled = cartItems.isNotEmpty(),
      modifier = Modifier.fillMaxWidth()
    ) {
      Text(text = "Enter Stock", maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }

  if (showQtyDialog && selectedProduct != null) {
    AlertDialog(
      onDismissRequest = { showQtyDialog = false },
      title = { Text(text = "Enter Qty") },
      text = {
        OutlinedTextField(
          value = qtyInput,
          onValueChange = { qtyInput = it },
          label = { Text("Qty") },
          singleLine = true
        )
      },
      confirmButton = {
        Button(onClick = {
          val qty = qtyInput.toIntOrNull()
          if (qty == null || qty <= 0) {
            Toast.makeText(context, "Enter a valid qty", Toast.LENGTH_SHORT).show()
            return@Button
          }
          val item = selectedProduct ?: return@Button
          val existingIndex = cartItems.indexOfFirst { it.product.id == item.id }
          if (existingIndex >= 0) {
            val existing = cartItems[existingIndex]
            cartItems[existingIndex] = existing.copy(qty = existing.qty + qty)
          } else {
            cartItems.add(CartItem(item, qty))
          }
          // Clear search to immediately reveal the cart after adding.
          searchText = ""
          selectedProduct = null
          showQtyDialog = false
        }) {
          Text(text = "Add", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      },
      dismissButton = {
        Button(onClick = { showQtyDialog = false }) {
          Text(text = "Cancel", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      }
    )
  }

  if (showEditDialog && editCartItem != null) {
    AlertDialog(
      onDismissRequest = { showEditDialog = false },
      title = { Text(text = "Update Qty") },
      text = {
        OutlinedTextField(
          value = editQtyInput,
          onValueChange = { editQtyInput = it },
          label = { Text("Qty") },
          singleLine = true
        )
      },
      confirmButton = {
        Button(onClick = {
          val qty = editQtyInput.toIntOrNull()
          if (qty == null || qty <= 0) {
            Toast.makeText(context, "Enter a valid qty", Toast.LENGTH_SHORT).show()
            return@Button
          }
          val item = editCartItem ?: return@Button
          val idx = cartItems.indexOfFirst { it.product.id == item.product.id }
          if (idx >= 0) {
            cartItems[idx] = item.copy(qty = qty)
          }
          showEditDialog = false
        }) {
          Text(text = "Update", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      },
      dismissButton = {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Button(
            onClick = { showEditDialog = false },
            modifier = Modifier.weight(1f)
          ) {
            Text(text = "Cancel", maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
          Button(
            onClick = {
              val item = editCartItem
              if (item != null) {
                cartItems.removeAll { it.product.id == item.product.id }
              }
              showEditDialog = false
            },
            modifier = Modifier.weight(1f)
          ) {
            Text(text = "Remove", maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
        }
      }
    )
  }

  if (showAddDialog) {
    AddProductDialog(
      name = addName,
      categories = categories,
      units = units,
      selectedCategoryId = addCategoryId,
      selectedUnitId = addUnitId,
      loading = addLoading,
      errorMessage = addError,
      categoryMenuExpanded = categoryMenuExpanded,
      unitMenuExpanded = unitMenuExpanded,
      onNameChange = { addName = it },
      onCategoryMenuOpen = { categoryMenuExpanded = true },
      onCategoryMenuDismiss = { categoryMenuExpanded = false },
      onUnitMenuOpen = { unitMenuExpanded = true },
      onUnitMenuDismiss = { unitMenuExpanded = false },
      onCategorySelected = {
        addCategoryId = it
        categoryMenuExpanded = false
      },
      onUnitSelected = {
        addUnitId = it
        unitMenuExpanded = false
      },
      onDismiss = {
        if (!addLoading) {
          showAddDialog = false
          addError = ""
        }
      },
      onSave = {
        val formattedName = toTitleCase(addName)
        if (formattedName.isBlank()) {
          addError = "Enter a product name."
          return@AddProductDialog
        }
        scope.launch {
          addLoading = true
          addError = ""
          try {
            val sku = repository.getNextAutoSku()
            val created = repository.createProduct(
              name = formattedName,
              sku = sku,
              categoryId = addCategoryId,
              unitId = addUnitId
            )
            repository.upsertProductLocations(created.id, AppConfig.AUTO_LOCATION_IDS)
            products = repository.fetchCarpentryProducts()
            Log.d(logTag, "Reloaded ${products.size} products after add")
            showAddDialog = false
            addName = ""
            addCategoryId = null
            addUnitId = null
            selectedProduct = created
            qtyInput = "1"
            showQtyDialog = true
          } catch (err: Exception) {
            addError = err.message ?: "Failed to add product."
          } finally {
            addLoading = false
          }
        }
      }
    )
  }

  if (showSetSuggestionDialog && pendingSetSuggestions.isNotEmpty()) {
    AlertDialog(
      onDismissRequest = { showSetSuggestionDialog = false },
      title = { Text(text = "Possible Set Detected") },
      text = {
        Column {
          Text(
            text = "Based on the last transfer, these products may form a set:",
            color = MaterialTheme.colorScheme.onBackground
          )
          Spacer(modifier = Modifier.height(8.dp))
          pendingSetSuggestions.forEach { line ->
            Text(
              text = "- $line",
              color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.9f)
            )
          }
        }
      },
      confirmButton = {
        Button(onClick = { showSetSuggestionDialog = false }) {
          Text(text = "OK")
        }
      }
    )
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
      .padding(20.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Image(
      painter = painterResource(id = R.drawable.login_photo),
      contentDescription = "Factory Production Login",
      modifier = Modifier
        .fillMaxWidth(0.82f)
        .height(260.dp)
        .padding(bottom = 20.dp),
      contentScale = ContentScale.Fit
    )
    Text(
      text = "Factory Production",
      style = MaterialTheme.typography.headlineSmall,
      color = MaterialTheme.colorScheme.onBackground
    )
    Spacer(modifier = Modifier.height(18.dp))
    OutlinedTextField(
      value = email,
      onValueChange = { email = it },
      label = { Text("Email") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth()
    )
    Spacer(modifier = Modifier.height(10.dp))
    OutlinedTextField(
      value = password,
      onValueChange = { password = it },
      label = { Text("Password") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth()
    )
    if (errorMessage.isNotEmpty()) {
      Spacer(modifier = Modifier.height(10.dp))
      Text(text = errorMessage, color = MaterialTheme.colorScheme.onBackground)
    }
    Spacer(modifier = Modifier.height(16.dp))
    Button(
      onClick = {
        if (email.isBlank() || password.isBlank()) {
          errorMessage = "Enter email and password."
          return@Button
        }
        scope.launch {
          loading = true
          errorMessage = ""
          try {
            val session = onLogin(email.trim(), password.trim())
            onSuccess(session)
          } catch (err: Exception) {
            errorMessage = err.message ?: "Login failed."
          } finally {
            loading = false
          }
        }
      },
      enabled = !loading,
      modifier = Modifier.fillMaxWidth()
    ) {
      Text(text = if (loading) "Signing in..." else "Sign In")
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddProductDialog(
  name: String,
  categories: List<CategoryItem>,
  units: List<UnitItem>,
  selectedCategoryId: Int?,
  selectedUnitId: Int?,
  loading: Boolean,
  errorMessage: String,
  categoryMenuExpanded: Boolean,
  unitMenuExpanded: Boolean,
  onNameChange: (String) -> Unit,
  onCategoryMenuOpen: () -> Unit,
  onCategoryMenuDismiss: () -> Unit,
  onUnitMenuOpen: () -> Unit,
  onUnitMenuDismiss: () -> Unit,
  onCategorySelected: (Int) -> Unit,
  onUnitSelected: (Int) -> Unit,
  onDismiss: () -> Unit,
  onSave: () -> Unit
) {
  val categoryLabel = categories.firstOrNull { it.id == selectedCategoryId }?.name ?: "Select category"
  val unitLabel = units.firstOrNull { it.id == selectedUnitId }?.name ?: "Select unit"

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(text = "Add Product") },
    text = {
      Column {
        OutlinedTextField(
          value = name,
          onValueChange = onNameChange,
          label = { Text("Product name") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(10.dp))
        ExposedDropdownMenuBox(
          expanded = categoryMenuExpanded,
          onExpandedChange = { expanded ->
            if (expanded) onCategoryMenuOpen() else onCategoryMenuDismiss()
          }
        ) {
          OutlinedTextField(
            value = categoryLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text("Category") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
            modifier = Modifier
              .fillMaxWidth()
              .menuAnchor()
          )
          DropdownMenu(
            expanded = categoryMenuExpanded,
            onDismissRequest = onCategoryMenuDismiss
          ) {
            if (categories.isEmpty()) {
              DropdownMenuItem(
                text = { Text("No categories available") },
                onClick = {},
                enabled = false
              )
            } else {
              categories.forEach { category ->
                DropdownMenuItem(
                  text = { Text(category.name) },
                  onClick = { onCategorySelected(category.id) }
                )
              }
            }
          }
        }
        Spacer(modifier = Modifier.height(10.dp))
        ExposedDropdownMenuBox(
          expanded = unitMenuExpanded,
          onExpandedChange = { expanded ->
            if (expanded) onUnitMenuOpen() else onUnitMenuDismiss()
          }
        ) {
          OutlinedTextField(
            value = unitLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text("Unit of Measure") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitMenuExpanded) },
            modifier = Modifier
              .fillMaxWidth()
              .menuAnchor()
          )
          DropdownMenu(
            expanded = unitMenuExpanded,
            onDismissRequest = onUnitMenuDismiss
          ) {
            if (units.isEmpty()) {
              DropdownMenuItem(
                text = { Text("No units available") },
                onClick = {},
                enabled = false
              )
            } else {
              units.forEach { unit ->
                val label = if (unit.abbreviation.isNullOrBlank()) unit.name else "${unit.name} (${unit.abbreviation})"
                DropdownMenuItem(
                  text = { Text(label) },
                  onClick = { onUnitSelected(unit.id) }
                )
              }
            }
          }
        }
        if (errorMessage.isNotEmpty()) {
          Spacer(modifier = Modifier.height(8.dp))
          Text(text = errorMessage, color = MaterialTheme.colorScheme.onBackground)
        }
      }
    },
    confirmButton = {
      Button(onClick = onSave, enabled = !loading) {
        Text(text = if (loading) "Saving..." else "Save", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    },
    dismissButton = {
      Button(onClick = onDismiss, enabled = !loading) {
        Text(text = "Cancel", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  )
}

@Composable
fun SummaryScreen(
  cartItems: List<CartItem>,
  session: UserSession,
  repository: ProductRepository,
  transferNumber: String,
  onBack: () -> Unit,
  onApproved: (String, String, List<String>) -> Unit,
  onPrintStatusUpdate: (String) -> Unit = {}
) {
  val context = LocalContext.current
  val logTag = "FactoryProductionFlow"
  val scope = rememberCoroutineScope()
  var approving by remember { mutableStateOf(false) }
  var testing by remember { mutableStateOf(false) }
  var errorMessage by remember { mutableStateOf("") }
  val totalQty = cartItems.sumOf { it.qty }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Text(
      text = "Summary",
      style = MaterialTheme.typography.headlineSmall,
      color = MaterialTheme.colorScheme.onBackground
    )
    Text(text = "Items: ${cartItems.size} | Total Qty: $totalQty", color = MaterialTheme.colorScheme.onBackground)
    Text(
      text = "Transfer #: ${if (transferNumber.isBlank()) "Generating..." else transferNumber}",
      color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f)
    )
    Spacer(modifier = Modifier.height(12.dp))

    LazyColumn(modifier = Modifier.weight(1f)) {
      items(cartItems) { item ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = item.product.name,
              color = MaterialTheme.colorScheme.onBackground,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
            val sku = item.product.sku
            if (!sku.isNullOrBlank()) {
              Text(
                text = sku,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            }
          }
          Text(
            text = "Qty: ${item.qty}",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }
      }
    }

    if (errorMessage.isNotEmpty()) {
      Spacer(modifier = Modifier.height(8.dp))
      Text(text = errorMessage, color = MaterialTheme.colorScheme.onBackground)
    }

    Spacer(modifier = Modifier.height(8.dp))
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Button(onClick = onBack, enabled = !approving && !testing, modifier = Modifier.weight(1f)) {
        Text(text = "Back", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      Button(
        onClick = {
          scope.launch {
            testing = true
            errorMessage = ""
            try {
              Log.d(logTag, "TestPrint started: userId=${session.id}, cartItems=${cartItems.size}, totalQty=$totalQty")
              if (cartItems.isEmpty()) {
                Log.w(logTag, "TestPrint aborted: cart is empty")
                errorMessage = "Cart is empty. Add at least one item to test print."
                Toast.makeText(context, "Cart is empty.", Toast.LENGTH_SHORT).show()
                return@launch
              }
              val firstItem = cartItems.first()
              val testTransferId = "test-print-${System.currentTimeMillis()}"
              val itemArray = JSONArray().put(
                JSONObject()
                  .put("name", firstItem.product.name)
                  .put("sku", firstItem.product.sku ?: "")
                  .put("qty", firstItem.qty)
              )
              val payload = JSONObject()
                .put("job_type", "carpentry_labels")
                .put("transfer_id", testTransferId)
                .put("is_test_print", true)
                .put("to_location", AppConfig.TO_LOCATION_ID)
                .put("print_date", formatPrintDate(Date()))
                .put("printed_by", session.fullName)
                .put("items", itemArray)

              Log.d(
                logTag,
                "TestPrint queue request: transferId=$testTransferId, toLocation=${AppConfig.TO_LOCATION_ID}, itemCount=${itemArray.length()}"
              )
              val jobId = repository.createLabelJob(payload)
              Log.d(logTag, "TestPrint queued: transferId=$testTransferId, jobId=$jobId")
              Toast.makeText(context, "Test print job queued.", Toast.LENGTH_SHORT).show()
            } catch (err: Exception) {
              errorMessage = err.message ?: "Test print failed."
              Log.e(logTag, "TestPrint failed: ${errorMessage}", err)
              Toast.makeText(context, "Test print failed: ${errorMessage}", Toast.LENGTH_LONG).show()
            } finally {
              Log.d(logTag, "TestPrint finished: testing=false")
              testing = false
            }
          }
        },
        enabled = !approving && !testing,
        modifier = Modifier.weight(1f)
      ) {
        Text(text = if (testing) "Testing..." else "Test Print", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      Button(
        onClick = {
          if (cartItems.isEmpty()) {
            Log.w(logTag, "Approve ignored: cart is empty")
            return@Button
          }
          scope.launch {
            approving = true
            errorMessage = ""
            try {
              val capturedAt = formatIsoTimestamp(Date())
              val resolvedTransferNumber = if (transferNumber.isBlank()) {
                repository.getNextTransferNumber()
              } else {
                transferNumber
              }

              Log.d(
                logTag,
                "Approve started: userId=${session.id}, transferNumber=$resolvedTransferNumber, cartItems=${cartItems.size}, totalQty=$totalQty"
              )
              onPrintStatusUpdate("Saving transfer and queueing label job...")
              val approveResult = repository.approveFactoryTransferViaApi(
                fromLocation = AppConfig.FROM_LOCATION_ID,
                toLocation = AppConfig.TO_LOCATION_ID,
                userId = session.id,
                userEmail = session.email,
                userFullName = session.fullName,
                capturedAt = capturedAt,
                transferNumber = resolvedTransferNumber,
                items = cartItems
              )
              val sessionId = approveResult.sessionId
              val labelJobId = approveResult.labelJobId.orEmpty()
              Log.d(
                logTag,
                "Approve API success: sessionId=$sessionId, transferNumber=${approveResult.transferNumber ?: resolvedTransferNumber}, labelJobId=$labelJobId"
              )

              onPrintStatusUpdate("Label job queued. Waiting for printer confirmation...")
              Log.d(logTag, "Approve polling label outcome: transferId=$sessionId, labelJobId=$labelJobId, timeoutMs=15000, pollMs=2000")

              try {
                val labelResult = waitForLabelOutcome(
                  repository = repository,
                  transferId = sessionId,
                  labelJobId = labelJobId,
                  timeoutMs = 15000,
                  pollMs = 2000
                )
                when (labelResult?.status?.lowercase(Locale.getDefault())) {
                  "done" -> {
                    Log.d(logTag, "Approve print done: transferId=$sessionId, jobId=${labelResult.id}")
                    onPrintStatusUpdate("Printed successfully (job ${labelResult.id}).")
                    Toast.makeText(context, "Label printed successfully.", Toast.LENGTH_SHORT).show()
                  }
                  "failed" -> {
                    val msg = labelResult.error ?: "Printer reported failure."
                    Log.e(logTag, "Approve print failed: transferId=$sessionId, jobId=${labelResult.id}, error=$msg")
                    onPrintStatusUpdate("Print failed: $msg")
                    Toast.makeText(context, "Print failed: $msg", Toast.LENGTH_LONG).show()
                  }
                  "pending", "processing" -> {
                    Log.d(logTag, "Approve print accepted: transferId=$sessionId, jobId=${labelResult.id}, status=${labelResult.status}")
                    onPrintStatusUpdate("Label job accepted (${labelResult.status}).")
                  }
                  else -> {
                    Log.w(logTag, "Approve print pending/unknown: transferId=$sessionId")
                    onPrintStatusUpdate("Queued. Printer confirmation pending.")
                    Toast.makeText(context, "Print queued. Confirmation pending.", Toast.LENGTH_SHORT).show()
                  }
                }
              } catch (pollErr: Exception) {
                Log.w(logTag, "Approve polling error: transferId=$sessionId, message=${pollErr.message}", pollErr)
                onPrintStatusUpdate("Queued. Printer confirmation pending.")
              }

              val setSuggestions = detectPossibleSetSuggestions(cartItems)
              Log.d(logTag, "Approve finished successfully: sessionId=$sessionId, setSuggestions=${setSuggestions.size}")
              onApproved(sessionId, resolvedTransferNumber, setSuggestions)
            } catch (err: Exception) {
              errorMessage = err.message ?: "Approval failed."
              Log.e(logTag, "Approve failed: ${errorMessage}", err)
              onPrintStatusUpdate("Print queue failed: ${errorMessage}")
              Toast.makeText(context, "Approval failed: ${errorMessage}", Toast.LENGTH_LONG).show()
            } finally {
              Log.d(logTag, "Approve finished: approving=false")
              approving = false
            }
          }
        },
        enabled = !approving && !testing,
        modifier = Modifier.weight(1f)
      ) {
        Text(text = if (approving) "Approving..." else "Approve", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

fun toTitleCase(value: String): String {
  val parts = value.trim().lowercase(Locale.getDefault()).split(Regex("\\s+")).filter { it.isNotBlank() }
  return parts.joinToString(" ") { word ->
    word.replaceFirstChar { char ->
      if (char.isLowerCase()) char.titlecase(Locale.getDefault()) else char.toString()
    }
  }
}

fun formatIsoTimestamp(date: Date): String {
  val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
  formatter.timeZone = TimeZone.getTimeZone("UTC")
  return formatter.format(date)
}

fun formatPrintDate(date: Date): String {
  val formatter = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
  formatter.timeZone = TimeZone.getTimeZone("GMT+2")
  return formatter.format(date)
}

fun detectPossibleSetSuggestions(items: List<CartItem>): List<String> {
  data class ParsedName(
    val original: String,
    val normalized: String,
    val key: String,
    val type: String
  )

  fun normalize(value: String): String {
    return value
      .lowercase(Locale.getDefault())
      .replace(Regex("[^a-z0-9\\s]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  fun productType(normalized: String): String {
    return when {
      Regex("\\btables?\\b").containsMatchIn(normalized) -> "table"
      Regex("\\bchairs?\\b").containsMatchIn(normalized) -> "chair"
      else -> ""
    }
  }

  val parsed = items.mapNotNull { item ->
    val norm = normalize(item.product.name)
    if (norm.isBlank()) return@mapNotNull null
    val type = productType(norm)
    if (type.isBlank()) return@mapNotNull null
    val key = norm
      .replace(Regex("\\b(dining|kitchen|tables?|chairs?|set|with|and)\\b"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
    if (key.isBlank()) return@mapNotNull null
    ParsedName(item.product.name, norm, key, type)
  }

  if (parsed.size < 2) return emptyList()

  val grouped = parsed.groupBy { it.key }
  val suggestions = mutableListOf<String>()
  grouped.forEach { (_, values) ->
    val hasTable = values.any { it.type == "table" }
    val hasChair = values.any { it.type == "chair" }
    if (hasTable && hasChair) {
      val tableName = values.firstOrNull { it.type == "table" }?.original ?: "Table"
      val chairName = values.firstOrNull { it.type == "chair" }?.original ?: "Chair"
      suggestions.add("$tableName + $chairName")
    }
  }
  return suggestions.distinct()
}

suspend fun waitForLabelOutcome(
  repository: ProductRepository,
  transferId: String,
  labelJobId: String = "",
  timeoutMs: Long,
  pollMs: Long
): LabelJobState? {
  val logTag = "FactoryProductionFlow"
  var attempt = 0
  val hasJobId = labelJobId.isNotBlank()
  val startedAt = System.currentTimeMillis()
  Log.d(logTag, "waitForLabelOutcome start: transferId=$transferId, labelJobId=$labelJobId, timeoutMs=$timeoutMs, pollMs=$pollMs")
  while (System.currentTimeMillis() - startedAt < timeoutMs) {
    attempt += 1
    val row = if (hasJobId) {
      repository.findLabelJobById(labelJobId)
    } else {
      repository.findLatestLabelJobByTransferId(transferId)
    }
    val status = row?.status?.lowercase(Locale.getDefault()) ?: ""
    val elapsed = System.currentTimeMillis() - startedAt
    Log.d(logTag, "waitForLabelOutcome poll #$attempt: transferId=$transferId, labelJobId=$labelJobId, status=${if (status.isBlank()) "<none>" else status}, jobId=${row?.id ?: ""}, elapsedMs=$elapsed")
    if (status == "done" || status == "failed" || status == "pending" || status == "processing") {
      Log.d(logTag, "waitForLabelOutcome terminal status: transferId=$transferId, status=$status, jobId=${row?.id ?: ""}")
      return row
    }
    delay(pollMs)
  }
  Log.w(logTag, "waitForLabelOutcome timeout reached: transferId=$transferId, labelJobId=$labelJobId, timeoutMs=$timeoutMs")
  val finalRow = if (hasJobId) {
    repository.findLabelJobById(labelJobId)
  } else {
    repository.findLatestLabelJobByTransferId(transferId)
  }
  Log.d(logTag, "waitForLabelOutcome final fetch: transferId=$transferId, labelJobId=$labelJobId, status=${finalRow?.status ?: "<none>"}, jobId=${finalRow?.id ?: ""}")
  return finalRow
}

@Composable
fun PrintHistoryScreen(
  repository: ProductRepository,
  onBack: () -> Unit
) {
  data class ReprintItemDraft(
    val name: String,
    val sku: String,
    val qty: Int
  )

  fun parseItemsFromPayload(payloadJson: String): MutableList<ReprintItemDraft> {
    val payload = try {
      JSONObject(payloadJson)
    } catch (_: Exception) {
      JSONObject()
    }
    val arr = payload.optJSONArray("items") ?: JSONArray()
    val out = ArrayList<ReprintItemDraft>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val name = row.optString("name", "")
      val sku = row.optString("sku", "")
      val qty = row.optInt("qty", 0)
      if (name.isBlank() || qty <= 0) continue
      out.add(ReprintItemDraft(name = name, sku = sku, qty = qty))
    }
    return out
  }

  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var loading by remember { mutableStateOf(true) }
  var reprintJobId by remember { mutableStateOf("") }
  var errorMessage by remember { mutableStateOf("") }
  var jobs by remember { mutableStateOf<List<PrintJobHistoryItem>>(emptyList()) }
  var selectedJob by remember { mutableStateOf<PrintJobHistoryItem?>(null) }
  var showEditReprintDialog by remember { mutableStateOf(false) }

  fun refresh() {
    scope.launch {
      loading = true
      errorMessage = ""
      try {
        jobs = repository.fetchRecentLabelJobs()
      } catch (err: Exception) {
        errorMessage = err.message ?: "Failed to load print history."
      } finally {
        loading = false
      }
    }
  }

  LaunchedEffect(Unit) {
    refresh()
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(16.dp)
  ) {
    Text(
      text = "Print Job History",
      style = MaterialTheme.typography.headlineSmall,
      color = MaterialTheme.colorScheme.onBackground
    )
    Text(
      text = "Showing successful printed jobs only (latest first).",
      color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
    )
    Spacer(modifier = Modifier.height(8.dp))
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Button(onClick = onBack, modifier = Modifier.weight(1f)) {
        Text(text = "Back")
      }
      Button(onClick = { refresh() }, modifier = Modifier.weight(1f)) {
        Text(text = "Refresh")
      }
    }

    if (loading) {
      Spacer(modifier = Modifier.height(12.dp))
      Text(text = "Loading history...", color = MaterialTheme.colorScheme.onBackground)
    }

    if (errorMessage.isNotEmpty()) {
      Spacer(modifier = Modifier.height(12.dp))
      Text(text = errorMessage, color = MaterialTheme.colorScheme.onBackground)
    }

    Spacer(modifier = Modifier.height(12.dp))
    LazyColumn(modifier = Modifier.weight(1f)) {
      items(jobs) { job ->
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clickable {
              selectedJob = job
              showEditReprintDialog = true
            }
            .padding(vertical = 8.dp)
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
          ) {
            Text(
              text = "Status: ${job.status.ifBlank { "unknown" }}",
              color = MaterialTheme.colorScheme.onBackground,
              fontWeight = FontWeight.SemiBold
            )
            IconButton(
              onClick = {
                scope.launch {
                  reprintJobId = job.id
                  try {
                    val payload = JSONObject(job.payloadJson)
                    repository.reprintLabelJobFromPayload(
                      sourcePayload = payload,
                      sourceJobId = job.id,
                      itemsOverride = null
                    )
                    Toast.makeText(context, "Full job reprint queued.", Toast.LENGTH_SHORT).show()
                    refresh()
                  } catch (err: Exception) {
                    Toast.makeText(context, err.message ?: "Reprint failed.", Toast.LENGTH_LONG).show()
                  } finally {
                    reprintJobId = ""
                  }
                }
              },
              enabled = reprintJobId.isBlank() || reprintJobId != job.id
            ) {
              Icon(
                painter = painterResource(id = R.drawable.ic_print),
                contentDescription = "Reprint full job",
                tint = MaterialTheme.colorScheme.onBackground
              )
            }
          }
          Text(
            text = "Transfer: ${job.transferId.ifBlank { "-" }}",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f)
          )
          Text(
            text = "Created: ${job.createdAt.ifBlank { "-" }} | Items: ${job.itemCount}",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f)
          )
          if (!job.error.isNullOrBlank()) {
            Text(
              text = "Error: ${job.error}",
              color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.85f)
            )
          }
          Spacer(modifier = Modifier.height(6.dp))
          Text(
            text = "Tap job to edit items for partial reprint.",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.72f)
          )
        }
      }
    }
  }

  if (showEditReprintDialog && selectedJob != null) {
    val job = selectedJob!!
    val draftItems = remember(job.id) { mutableStateListOf<ReprintItemDraft>().apply { addAll(parseItemsFromPayload(job.payloadJson)) } }
    AlertDialog(
      onDismissRequest = { showEditReprintDialog = false },
      title = { Text(text = "Partial Reprint") },
      text = {
        Column {
          Text(
            text = "Remove any items below, then reprint. Original job remains unchanged.",
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.9f)
          )
          Spacer(modifier = Modifier.height(8.dp))
          LazyColumn(modifier = Modifier.heightIn(max = 280.dp)) {
            items(draftItems) { item ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(text = item.name, color = MaterialTheme.colorScheme.onBackground)
                  Text(
                    text = "SKU: ${item.sku.ifBlank { "-" }} | Qty: ${item.qty}",
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
                  )
                }
                Button(
                  onClick = { draftItems.remove(item) }
                ) {
                  Text(text = "Remove")
                }
              }
              Spacer(modifier = Modifier.height(6.dp))
            }
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            scope.launch {
              if (draftItems.isEmpty()) {
                Toast.makeText(context, "No items left to print.", Toast.LENGTH_SHORT).show()
                return@launch
              }
              val sourcePayload = try {
                JSONObject(job.payloadJson)
              } catch (_: Exception) {
                JSONObject()
              }
              val selectedItems = JSONArray()
              draftItems.forEach { item ->
                selectedItems.put(
                  JSONObject()
                    .put("name", item.name)
                    .put("sku", item.sku)
                    .put("qty", item.qty)
                )
              }
              reprintJobId = job.id
              try {
                repository.reprintLabelJobFromPayload(
                  sourcePayload = sourcePayload,
                  sourceJobId = job.id,
                  itemsOverride = selectedItems
                )
                Toast.makeText(context, "Partial reprint queued.", Toast.LENGTH_SHORT).show()
                showEditReprintDialog = false
                refresh()
              } catch (err: Exception) {
                Toast.makeText(context, err.message ?: "Partial reprint failed.", Toast.LENGTH_LONG).show()
              } finally {
                reprintJobId = ""
              }
            }
          },
          enabled = reprintJobId.isBlank() || reprintJobId != job.id
        ) {
          Text(text = if (reprintJobId == job.id) "Reprinting..." else "Reprint Selected")
        }
      },
      dismissButton = {
        Button(onClick = { showEditReprintDialog = false }) {
          Text(text = "Cancel")
        }
      }
    )
  }
}

@Composable
fun ApprovalSuccessScreen(
  transferNumber: String,
  sessionId: String,
  printStatus: String,
  onNewEntry: () -> Unit,
  onBack: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .padding(20.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Text(
      text = "Transfer Saved",
      style = MaterialTheme.typography.headlineSmall,
      color = MaterialTheme.colorScheme.onBackground
    )
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      text = "Transfer #: ${transferNumber.ifBlank { "-" }}",
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Bold
    )
    if (sessionId.isNotBlank()) {
      Text(
        text = "Session ID: $sessionId",
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
      )
    }
    if (printStatus.isNotBlank()) {
      Spacer(modifier = Modifier.height(8.dp))
      Text(
        text = "Print: $printStatus",
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.9f)
      )
    }
    Spacer(modifier = Modifier.height(18.dp))
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Button(onClick = onNewEntry, modifier = Modifier.weight(1f)) {
        Text(text = "New Entry", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      Button(onClick = onBack, modifier = Modifier.weight(1f)) {
        Text(text = "Back", maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}
