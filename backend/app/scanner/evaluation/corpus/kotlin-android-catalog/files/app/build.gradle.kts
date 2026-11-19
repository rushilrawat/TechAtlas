plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose)
    alias(libs.plugins.gms)
}

dependencies {
    implementation(libs.androidx.compose.ui)
    implementation(libs.firebase.analytics)
    testImplementation(libs.junit)
}
