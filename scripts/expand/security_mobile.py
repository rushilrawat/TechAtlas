#!/usr/bin/env python3
"""Phase 1B expansion — Batch 6: Security + Mobile/Desktop."""
from __future__ import annotations

from _apply import apply_batch

SEC = "domain:security"
MOB = "domain:mobile"


def t(slug, name, subtype, desc, domain, **extra):
    node = {
        "id": f"technology:{slug}", "slug": slug, "name": name,
        "node_type": "technology", "node_subtype": subtype,
        "primary_domain": domain, "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


def c(slug, name, desc, domain, **extra):
    node = {
        "id": f"concept:{slug}", "slug": slug, "name": name,
        "node_type": "concept", "primary_domain": domain,
        "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


TECHNOLOGIES = [
    # --- Security ---
    t("wireshark", "Wireshark", "developer_tool",
      "A network protocol analyzer for capturing and inspecting traffic.",
      domain=SEC, official_url="https://www.wireshark.org",
      documentation_url="https://www.wireshark.org/docs/",
      wikipedia_title="Wireshark", wikidata_id="Q272542"),
    t("metasploit", "Metasploit", "developer_tool",
      "A penetration testing framework for developing and executing exploits.",
      domain=SEC, official_url="https://www.metasploit.com",
      documentation_url="https://docs.metasploit.com/",
      wikipedia_title="Metasploit", wikidata_id="Q1639122"),
    t("burp-suite", "Burp Suite", "developer_tool",
      "A platform for web application security testing.",
      domain=SEC, official_url="https://portswigger.net/burp",
      documentation_url="https://portswigger.net/burp/documentation",
      wikipedia_title="Burp Suite"),
    t("nmap", "Nmap", "developer_tool",
      "A network scanner for discovery and security auditing.",
      domain=SEC, official_url="https://nmap.org",
      documentation_url="https://nmap.org/docs.html",
      wikipedia_title="Nmap", wikidata_id="Q846454"),
    t("snort", "Snort", "developer_tool",
      "An open-source network intrusion detection and prevention system.",
      domain=SEC, official_url="https://www.snort.org",
      documentation_url="https://www.snort.org/documents",
      wikipedia_title="Snort (software)", wikidata_id="Q1193033"),
    t("let-s-encrypt", "Let's Encrypt", "cloud_service",
      "A free, automated, and open certificate authority.",
      aliases=["lets encrypt"], domain=SEC, official_url="https://letsencrypt.org",
      documentation_url="https://letsencrypt.org/docs/",
      wikipedia_title="Let's Encrypt", wikidata_id="Q19944280"),
    t("owasp-zap", "OWASP ZAP", "developer_tool",
      "An open-source web application security scanner.",
      aliases=["zap"], domain=SEC, official_url="https://www.zaproxy.org",
      documentation_url="https://www.zaproxy.org/docs/"),
    t("okta", "Okta", "cloud_service",
      "A cloud-based identity and access management service.",
      domain=SEC, official_url="https://www.okta.com",
      documentation_url="https://developer.okta.com/docs/",
      wikipedia_title="Okta, Inc."),
    # --- Mobile / Desktop ---
    t("swift", "Swift", "programming_language",
      "Apple's modern language for iOS, macOS, and beyond.",
      domain=MOB, official_url="https://www.swift.org",
      documentation_url="https://www.swift.org/documentation/",
      wikipedia_title="Swift (programming language)", wikidata_id="Q17118377"),
    t("swiftui", "SwiftUI", "framework",
      "Apple's declarative UI framework for building apps across its platforms.",
      domain=MOB, official_url="https://developer.apple.com/xcode/swiftui/",
      documentation_url="https://developer.apple.com/documentation/swiftui",
      wikipedia_title="SwiftUI"),
    t("jetpack-compose", "Jetpack Compose", "framework",
      "Android's modern declarative UI toolkit built with Kotlin.",
      domain=MOB, official_url="https://developer.android.com/jetpack/compose",
      documentation_url="https://developer.android.com/jetpack/compose/documentation"),
    t("android-sdk", "Android SDK", "sdk",
      "The software development kit for building Android applications.",
      aliases=["android"], domain=MOB,
      official_url="https://developer.android.com",
      documentation_url="https://developer.android.com/docs",
      wikipedia_title="Android software development", wikidata_id="Q6935260"),
    t("expo", "Expo", "framework",
      "A framework and platform for universal React Native applications.",
      domain=MOB, official_url="https://expo.dev",
      documentation_url="https://docs.expo.dev/"),
    t("tauri", "Tauri", "framework",
      "A toolkit for building desktop apps with a web frontend and Rust backend.",
      domain=MOB, official_url="https://tauri.app",
      documentation_url="https://tauri.app/develop/",
      wikipedia_title="Tauri (software framework)"),
    t("dotnet-maui", ".NET MAUI", "framework",
      "A cross-platform framework for native mobile and desktop apps with .NET.",
      aliases=["maui"], domain=MOB,
      official_url="https://dotnet.microsoft.com/apps/maui",
      documentation_url="https://learn.microsoft.com/en-us/dotnet/maui/"),
]

CONCEPTS = [
    # Security
    c("penetration-testing", "Penetration Testing",
      "Authorized simulated attacks to evaluate system security.",
      domain=SEC, aliases=["pentest"], wikipedia_title="Penetration test"),
    c("threat-modeling", "Threat Modeling",
      "A structured process for identifying and prioritizing potential threats.",
      domain=SEC, wikipedia_title="Threat model"),
    c("zero-trust", "Zero Trust Security",
      "A model that trusts no entity by default, verifying every request.",
      domain=SEC, aliases=["zero trust"], wikipedia_title="Zero trust security model"),
    c("public-key-cryptography", "Public-Key Cryptography",
      "Cryptography using key pairs of public and private keys.",
      domain=SEC, aliases=["asymmetric cryptography"],
      wikipedia_title="Public-key cryptography"),
    c("tls", "Transport Layer Security",
      "A protocol providing encryption and authentication for network communication.",
      domain=SEC, aliases=["tls", "ssl"], wikipedia_title="Transport Layer Security"),
    c("hashing", "Cryptographic Hash Function",
      "A one-way function mapping data to a fixed-size digest.",
      domain=SEC, aliases=["hashing"], wikipedia_title="Cryptographic hash function"),
    c("xss", "Cross-Site Scripting",
      "A web vulnerability allowing attackers to inject client-side scripts.",
      domain=SEC, aliases=["xss"], wikipedia_title="Cross-site scripting"),
    c("sql-injection", "SQL Injection",
      "An attack that inserts malicious SQL into application queries.",
      domain=SEC, wikipedia_title="SQL injection"),
    c("mfa", "Multi-Factor Authentication",
      "Requiring two or more verification factors to gain access.",
      domain=SEC, aliases=["mfa", "2fa"],
      wikipedia_title="Multi-factor authentication"),
    # Mobile / Desktop
    c("cross-platform-ui", "Declarative UI",
      "Describing UI as a function of state rather than imperative mutations.",
      domain=MOB, wikipedia_title="Declarative programming"),
    c("mobile-app-lifecycle", "Mobile Application Development",
      "The process of building software for mobile devices.",
      domain=MOB, wikipedia_title="Mobile app development"),
    c("push-notifications", "Push Technology",
      "Server-initiated delivery of information to client devices.",
      domain=MOB, aliases=["push notifications"], wikipedia_title="Push technology"),
]

EDGES = [
    *[{"source": n["id"], "target": n["primary_domain"],
       "relationship_type": "belongs_to_domain"} for n in TECHNOLOGIES + CONCEPTS],
    # written_in
    {"source": "technology:swiftui", "target": "technology:swift",
     "relationship_type": "written_in"},
    {"source": "technology:tauri", "target": "technology:rust",
     "relationship_type": "written_in"},
    {"source": "technology:nmap", "target": "technology:c",
     "relationship_type": "written_in"},
    # built_on
    {"source": "technology:jetpack-compose", "target": "technology:kotlin",
     "relationship_type": "written_in"},
    {"source": "technology:expo", "target": "technology:react-native",
     "relationship_type": "built_on"},
    {"source": "technology:dotnet-maui", "target": "technology:dotnet",
     "relationship_type": "built_on"},
    {"source": "technology:swiftui", "target": "concept:cross-platform-ui",
     "relationship_type": "implements"},
    {"source": "technology:jetpack-compose", "target": "concept:cross-platform-ui",
     "relationship_type": "implements"},
    # security implements/supports
    {"source": "technology:openssl", "target": "concept:tls",
     "relationship_type": "implements"},
    {"source": "technology:let-s-encrypt", "target": "concept:tls",
     "relationship_type": "supports"},
    {"source": "technology:nmap", "target": "concept:penetration-testing",
     "relationship_type": "used_for"},
    {"source": "technology:metasploit", "target": "concept:penetration-testing",
     "relationship_type": "used_for"},
    {"source": "technology:burp-suite", "target": "concept:penetration-testing",
     "relationship_type": "used_for"},
    {"source": "technology:owasp-zap", "target": "concept:xss",
     "relationship_type": "used_for"},
    {"source": "technology:snort", "target": "concept:threat-modeling",
     "relationship_type": "related_to"},
    {"source": "technology:okta", "target": "concept:mfa",
     "relationship_type": "supports"},
    {"source": "technology:keycloak", "target": "concept:mfa",
     "relationship_type": "supports"},
    {"source": "technology:wireshark", "target": "concept:tls",
     "relationship_type": "related_to"},
    # concept enablement
    {"source": "concept:public-key-cryptography", "target": "concept:tls",
     "relationship_type": "enables"},
    {"source": "concept:hashing", "target": "concept:encryption",
     "relationship_type": "related_to"},
    {"source": "concept:mfa", "target": "concept:authentication",
     "relationship_type": "enables"},
    {"source": "concept:zero-trust", "target": "concept:authorization",
     "relationship_type": "related_to"},
    # alternatives & combos
    {"source": "technology:okta", "target": "technology:auth0",
     "relationship_type": "alternative_to"},
    {"source": "technology:swiftui", "target": "technology:jetpack-compose",
     "relationship_type": "alternative_to"},
    {"source": "technology:tauri", "target": "technology:electron",
     "relationship_type": "alternative_to"},
    {"source": "technology:expo", "target": "technology:flutter",
     "relationship_type": "alternative_to"},
    {"source": "technology:owasp-zap", "target": "technology:burp-suite",
     "relationship_type": "alternative_to"},
    {"source": "technology:swift", "target": "technology:swiftui",
     "relationship_type": "commonly_used_with"},
]

if __name__ == "__main__":
    apply_batch("security_mobile", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
