// A JVM library: these comments and strings must not be read as plugins.
// id("com.android.application") would make this an Android app, but it is not applied.
plugins {
    `java-library`
    id("com.diffplug.spotless") version "6.25.0"
}

val androidNote = "com.google.gms.google-services is only mentioned here"

tasks.register("hello") {
    doLast { println("id(\"org.jetbrains.kotlin.multiplatform\")") }
}
