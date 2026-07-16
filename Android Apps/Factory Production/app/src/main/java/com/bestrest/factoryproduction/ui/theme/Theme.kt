package com.bestrest.factoryproduction.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val FactoryColorScheme = darkColorScheme(
  primary = FactoryRed,
  onPrimary = FactoryWhite,
  primaryContainer = FactoryRed,
  onPrimaryContainer = FactoryWhite,
  secondary = FactoryRed,
  onSecondary = FactoryWhite,
  secondaryContainer = FactoryRed,
  onSecondaryContainer = FactoryWhite,
  background = FactoryBlack,
  onBackground = FactoryWhite,
  surface = FactoryBlack,
  onSurface = FactoryWhite,
  surfaceVariant = FactoryBlack,
  onSurfaceVariant = FactoryWhite,
  outline = FactoryWhite,
  outlineVariant = FactoryWhite,
  error = FactoryRed,
  onError = FactoryWhite
)

@Composable
fun CarpentryTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = FactoryColorScheme,
    content = content
  )
}
