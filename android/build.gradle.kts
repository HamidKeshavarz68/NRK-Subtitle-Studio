plugins {
    id("com.android.application") version "9.4.1" apply false
    // AGP compiles Kotlin itself; this pins the Kotlin version it uses (must match the Compose plugin).
    id("org.jetbrains.kotlin.android") version "2.4.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.20" apply false
}
