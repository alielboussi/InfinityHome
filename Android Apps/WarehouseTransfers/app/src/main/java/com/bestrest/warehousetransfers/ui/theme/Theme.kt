package com.bestrest.warehousetransfers.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Dark scheme aligned with the Infinity Home website:
 * green primary actions, blue accents, white/light text, red errors.
 */
private val WarehouseColorScheme = darkColorScheme(
  primary = IhGreenStrong,
  onPrimary = IhWhite,
  primaryContainer = IhGreen,
  onPrimaryContainer = IhOnGreen,
  secondary = IhBlueStrong,
  onSecondary = IhWhite,
  secondaryContainer = IhBlue,
  onSecondaryContainer = IhOnGreen,
  tertiary = IhBlue,
  onTertiary = IhOnGreen,
  background = IhBg,
  onBackground = IhText,
  surface = IhSurface,
  onSurface = IhText,
  surfaceVariant = IhSurfaceAlt,
  onSurfaceVariant = IhMuted,
  outline = IhGreen.copy(alpha = 0.45f),
  outlineVariant = IhBlue.copy(alpha = 0.35f),
  error = IhRed,
  onError = IhWhite,
  errorContainer = Color(0xFF2A1B1B),
  onErrorContainer = IhRedSoft,
  inverseSurface = IhText,
  inverseOnSurface = IhBg,
  inversePrimary = IhGreen,
  scrim = IhBg.copy(alpha = 0.72f)
)

@Composable
fun WarehouseTransfersTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = WarehouseColorScheme,
    content = content
  )
}
