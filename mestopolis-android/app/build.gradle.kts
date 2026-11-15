plugins {
    id("com.android.application")
}

// číslo verzie: z GitHub Actions (-PversionCode=...), inak 1
val vCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1

android {
    namespace = "sk.mestopolis.hra"
    compileSdk = 34

    defaultConfig {
        applicationId = "sk.mestopolis.hra"
        minSdk = 26
        targetSdk = 34
        versionCode = vCode
        versionName = "1.$vCode"
    }

    signingConfigs {
        create("mestopolis") {
            // vlastný kľúč uložený v repozitári, aby sa dali nové verzie inštalovať cez staré
            storeFile = file("../keystore/mestopolis.jks")
            storePassword = "mestopolis"
            keyAlias = "mestopolis"
            keyPassword = "mestopolis"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("mestopolis")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

// skopíruje hru z ../../mestopolis do assets/www (bez súborov pre web hosting)
val copyWeb by tasks.registering(Sync::class) {
    from("../../mestopolis") {
        include("index.html", "style.css", "js/**", "vendor/three.module.js", "vendor/three.core.js", "icons/**")
    }
    into(layout.buildDirectory.dir("generated/web/www"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
