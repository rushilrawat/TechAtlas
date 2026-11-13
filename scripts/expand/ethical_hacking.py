#!/usr/bin/env python3
"""Ethical hacking cluster for the Security field: reconnaissance and OSINT, offensive
and defensive teams, CTFs, web and binary exploitation, password attacks, wireless,
social engineering, digital forensics, reverse engineering and malware analysis, plus
the tools practitioners actually use for each.

Run from the repo root:  python scripts/expand/ethical_hacking.py
"""
from __future__ import annotations

import json

from _apply import SEED, apply_batch
from big_expansion import SEC, SYS, C, R, T, c, e, t

EH = "domain:offensive-security"
NEW_DOMAIN = {"id": EH, "slug": "offensive-security", "name": "Ethical Hacking & Forensics",
              "short_description": "Attacking systems with permission, and investigating them "
                                   "after a breach: recon, exploitation, red and blue teams, "
                                   "forensics and reverse engineering.",
              "importance": 0.65, "node_type": "domain", "primary_domain": EH,
              "lifecycle_status": "active"}
# Existing Security nodes that belong in the new sub-field.
MOVES = {f"concept:{s}": EH for s in ("penetration-testing", "malware-analysis", "reverse-engineering", "phishing")}
MOVES |= {f"technology:{s}": EH for s in ("metasploit", "burp-suite", "nmap", "owasp-zap")}

TECH = "technique"
METH = "methodology"
STD = "standard"
TOOL = "developer_tool"
PLAT = "platform"
OS = "operating_system"
LIB = "library"

CONCEPTS = [
    # Practice and process
    c("ethical-hacking", "Ethical Hacking", EH, "Breaking into systems with permission to find weaknesses before attackers do.", "White hat (computer security)", 0.6, ["White-Hat Hacking"], METH),
    c("bug-bounty", "Bug Bounty", EH, "Programs that pay outside researchers for responsibly reported vulnerabilities.", "Bug bounty program", 0.45, None, METH),
    c("responsible-disclosure", "Responsible Disclosure", EH, "Reporting a vulnerability privately and giving the vendor time to fix it before going public.", "Coordinated vulnerability disclosure", 0.4, ["Coordinated Vulnerability Disclosure"], METH),
    c("capture-the-flag", "Capture the Flag (CTF)", EH, "Security competitions where players exploit challenges to find hidden flags.", "Capture the flag (cybersecurity)", 0.5, ["CTF"], METH),
    c("red-teaming", "Red Teaming", EH, "Simulating a real adversary end to end to test an organisation's defences.", "Red team", 0.5, ["Red Team"], METH),
    c("blue-teaming", "Blue Teaming", EH, "Defending systems: monitoring, detection and incident response.", "Blue team (computer security)", 0.45, ["Blue Team"], METH),
    c("purple-teaming", "Purple Teaming", EH, "Red and blue teams working together so every attack improves a detection.", None, 0.35, ["Purple Team"], METH),
    c("vulnerability-assessment", "Vulnerability Assessment", EH, "Systematically finding and ranking known weaknesses across systems.", "Vulnerability assessment (computing)", 0.45, None, METH),
    c("cve", "CVE", SEC, "Common Vulnerabilities and Exposures: the public catalogue of known security flaws.", "Common Vulnerabilities and Exposures", 0.5, ["Common Vulnerabilities and Exposures"], STD),
    c("cvss", "CVSS", SEC, "A standard 0 to 10 score for how severe a vulnerability is.", "Common Vulnerability Scoring System", 0.35, ["Common Vulnerability Scoring System"], STD),
    c("mitre-attack", "MITRE ATT&CK", EH, "A knowledge base of real attacker tactics and techniques used to plan tests and detections.", "ATT&CK", 0.5, ["ATT&CK"], STD),
    c("cyber-kill-chain", "Cyber Kill Chain", EH, "The stages of an intrusion, from reconnaissance to actions on objectives.", "Kill chain (military)", 0.35, None, METH),
    c("threat-intelligence", "Threat Intelligence", SEC, "Evidence about attackers, their tools and indicators, used to anticipate attacks.", "Cyber threat intelligence", 0.45, ["CTI"], METH),
    c("security-operations-center", "Security Operations Center", SEC, "The team and tooling that watches an organisation's security around the clock.", "Information security operations center", 0.4, None, METH),
    c("incident-response", "Incident Response", EH, "Detecting, containing and recovering from a security breach.", "Computer security incident management", 0.5, ["IR"], METH),
    c("endpoint-detection-and-response", "Endpoint Detection and Response", SEC, "Agents on laptops and servers that record activity and flag attacks.", "Endpoint detection and response", 0.4, ["EDR"], TECH),
    c("honeypot", "Honeypot", SEC, "A decoy system that lures attackers so their behaviour can be studied.", "Honeypot (computing)", 0.35, None, TECH),
    # Reconnaissance
    c("osint", "OSINT", EH, "Open-source intelligence: gathering facts about a target from public sources.", "Open-source intelligence", 0.5, ["Open-Source Intelligence"], TECH),
    c("reconnaissance", "Reconnaissance", EH, "Mapping a target's people, domains, hosts and services before any attack.", None, 0.45, ["Recon"], TECH),
    c("network-scanning", "Network Scanning", EH, "Probing hosts and ports to see what is running and reachable.", "Port scanner", 0.45, ["Port Scanning"], TECH),
    c("google-dorking", "Google Dorking", EH, "Using advanced search operators to find exposed files and pages.", "Google hacking", 0.3, ["Google Hacking"], TECH),
    # Exploitation
    c("web-application-security", "Web Application Security", EH, "Finding and fixing flaws in web apps, guided by the OWASP Top 10.", "Web application security", 0.55, ["AppSec"], None),
    c("ssrf", "Server-Side Request Forgery", EH, "Tricking a server into making requests to places the attacker cannot reach.", "Server-side request forgery", 0.4, ["SSRF"], TECH),
    c("idor", "Insecure Direct Object Reference", EH, "Reading other users' data by changing an ID the server failed to check.", "Insecure direct object reference", 0.35, ["IDOR"], TECH),
    c("exploit-development", "Exploit Development", EH, "Turning a bug into reliable code that takes control of a program.", "Exploit (computer security)", 0.45, None, TECH),
    c("binary-exploitation", "Binary Exploitation", EH, "Attacking compiled programs through memory corruption bugs.", None, 0.4, ["Pwn"], TECH),
    c("return-oriented-programming", "Return-Oriented Programming", EH, "Chaining existing code fragments to bypass non-executable memory.", "Return-oriented programming", 0.35, ["ROP"], TECH),
    c("privilege-escalation", "Privilege Escalation", EH, "Going from a normal account to administrator or root.", "Privilege escalation", 0.45, ["Privesc"], TECH),
    c("lateral-movement", "Lateral Movement", EH, "Moving from the first compromised machine to others on the network.", None, 0.35, None, TECH),
    c("command-and-control", "Command and Control", EH, "The channel attackers use to steer compromised machines.", "Botnet", 0.35, ["C2"], TECH),
    c("active-directory-attacks", "Active Directory Attacks", EH, "Abusing Windows domain trust, Kerberos and permissions to take over a network.", "Active Directory", 0.35, ["AD Attacks"], TECH),
    c("password-cracking", "Password Cracking", EH, "Recovering passwords from their hashes by guessing at enormous speed.", "Password cracking", 0.45, None, TECH),
    c("brute-force-attack", "Brute-Force Attack", EH, "Trying every possible key or password until one works.", "Brute-force attack", 0.4, None, TECH),
    c("rainbow-table", "Rainbow Table", EH, "Precomputed hash chains that trade storage for faster password cracking.", "Rainbow table", 0.3, None, TECH),
    c("man-in-the-middle-attack", "Man-in-the-Middle Attack", EH, "Secretly relaying and altering traffic between two parties.", "Man-in-the-middle attack", 0.45, ["MITM"], TECH),
    c("packet-sniffing", "Packet Sniffing", EH, "Capturing network traffic to read or analyse it.", "Packet analyzer", 0.4, ["Packet Capture"], TECH),
    c("wireless-security", "Wireless Security", EH, "Attacking and defending Wi-Fi and Bluetooth: handshakes, rogue access points and WPA3.", "Wireless security", 0.4, ["Wi-Fi Hacking"], None),
    c("social-engineering", "Social Engineering", EH, "Manipulating people, not machines, into giving up access.", "Social engineering (security)", 0.5, None, TECH),
    # Forensics and reverse engineering
    c("digital-forensics", "Digital Forensics", EH, "Recovering and analysing evidence from computers and phones.", "Digital forensics", 0.5, ["Computer Forensics"], None),
    c("memory-forensics", "Memory Forensics", EH, "Analysing a RAM snapshot to find running malware and secrets.", "Memory forensics", 0.35, None, TECH),
    c("disk-forensics", "Disk Forensics", EH, "Examining disk images for deleted files, timelines and artefacts.", None, 0.3, None, TECH),
    c("disassembly", "Disassembly", EH, "Turning machine code back into readable assembly.", "Disassembler", 0.4, None, TECH),
    c("decompilation", "Decompilation", EH, "Reconstructing higher-level source code from a compiled binary.", "Decompiler", 0.35, None, TECH),
    c("dynamic-analysis", "Dynamic Analysis", EH, "Studying a program while it runs, with debuggers, hooks and sandboxes.", "Dynamic program analysis", 0.4, None, TECH),
    c("steganography", "Steganography", EH, "Hiding data inside images, audio or other innocent-looking files.", "Steganography", 0.3, None, TECH),
]

TECHNOLOGIES = [
    t("kali-linux", "Kali Linux", OS, EH, "A Linux distribution preloaded with hundreds of penetration-testing tools.", "Kali Linux", "https://www.kali.org"),
    t("parrot-os", "Parrot OS", OS, EH, "A security-focused Linux distribution for pentesting and privacy.", "Parrot OS", "https://parrotsec.org"),
    t("maltego", "Maltego", TOOL, EH, "Graph-based OSINT tool that links people, domains and infrastructure.", "Maltego", "https://www.maltego.com"),
    t("shodan", "Shodan", PLAT, EH, "A search engine for internet-connected devices and their open services.", "Shodan (website)", "https://www.shodan.io"),
    t("theharvester", "theHarvester", TOOL, EH, "Collects emails, subdomains and hosts about a target from public sources.", None, "https://github.com/laramies/theHarvester"),
    t("spiderfoot", "SpiderFoot", TOOL, EH, "Automates OSINT collection across hundreds of data sources.", None, "https://github.com/smicallef/spiderfoot"),
    t("sqlmap", "sqlmap", TOOL, EH, "Automatically finds and exploits SQL injection flaws.", "Sqlmap", "https://sqlmap.org"),
    t("ffuf", "ffuf", TOOL, EH, "A fast web fuzzer for discovering hidden paths, parameters and virtual hosts.", None, "https://github.com/ffuf/ffuf"),
    t("nuclei", "Nuclei", TOOL, EH, "Template-driven scanner for known vulnerabilities and misconfigurations.", None, "https://github.com/projectdiscovery/nuclei"),
    t("nessus", "Nessus", TOOL, EH, "A widely used commercial vulnerability scanner.", "Nessus (software)", "https://www.tenable.com/products/nessus"),
    t("openvas", "OpenVAS", TOOL, EH, "An open-source vulnerability scanner from Greenbone.", "OpenVAS", "https://www.openvas.org"),
    t("hashcat", "Hashcat", TOOL, EH, "GPU-accelerated password recovery for hundreds of hash types.", "Hashcat", "https://hashcat.net"),
    t("john-the-ripper", "John the Ripper", TOOL, EH, "A classic, flexible password cracker.", "John the Ripper", "https://www.openwall.com/john/"),
    t("hydra", "THC Hydra", TOOL, EH, "Online brute-force login tester for many network protocols.", None, "https://github.com/vanhauser-thc/thc-hydra"),
    t("aircrack-ng", "Aircrack-ng", TOOL, EH, "A suite for capturing and cracking Wi-Fi handshakes.", "Aircrack-ng", "https://www.aircrack-ng.org"),
    t("bettercap", "Bettercap", TOOL, EH, "A framework for network attacks and monitoring, including man-in-the-middle.", None, "https://www.bettercap.org"),
    t("gophish", "Gophish", TOOL, EH, "An open-source phishing simulation toolkit for awareness testing.", None, "https://getgophish.com"),
    t("bloodhound", "BloodHound", TOOL, EH, "Maps Active Directory relationships as a graph to find attack paths.", None, "https://github.com/SpecterOps/BloodHound"),
    t("mimikatz", "Mimikatz", TOOL, EH, "Extracts Windows credentials from memory; a staple of AD testing.", "Mimikatz", "https://github.com/gentilkiwi/mimikatz"),
    t("sliver", "Sliver", TOOL, EH, "An open-source command-and-control framework for red teams.", None, "https://github.com/BishopFox/sliver"),
    t("ghidra", "Ghidra", TOOL, EH, "The NSA's free reverse-engineering suite with a decompiler.", "Ghidra", "https://ghidra-sre.org"),
    t("ida-pro", "IDA Pro", TOOL, EH, "The long-standing commercial disassembler and decompiler.", "Interactive Disassembler", "https://hex-rays.com/ida-pro"),
    t("radare2", "radare2", TOOL, EH, "An open-source command-line reverse-engineering framework.", "Radare2", "https://rada.re"),
    t("binary-ninja", "Binary Ninja", TOOL, EH, "A modern reverse-engineering platform with a scriptable IL.", None, "https://binary.ninja"),
    t("gdb", "GDB", TOOL, SYS, "The GNU debugger for stepping through and inspecting native programs.", "GNU Debugger", "https://www.sourceware.org/gdb/"),
    t("x64dbg", "x64dbg", TOOL, EH, "An open-source Windows debugger popular for malware analysis.", None, "https://x64dbg.com"),
    t("frida", "Frida", TOOL, EH, "Dynamic instrumentation: inject scripts into running apps on desktop and mobile.", None, "https://frida.re"),
    t("pwntools", "pwntools", LIB, EH, "A Python library for writing CTF and exploit scripts.", None, "https://github.com/Gallopsled/pwntools"),
    t("autopsy", "Autopsy", TOOL, EH, "A graphical digital-forensics platform built on The Sleuth Kit.", "Autopsy (software)", "https://www.autopsy.com"),
    t("volatility", "Volatility", TOOL, EH, "The standard open-source framework for memory forensics.", "Volatility (software)", "https://volatilityfoundation.org"),
    t("yara", "YARA", TOOL, EH, "Pattern rules for identifying and classifying malware samples.", "YARA", "https://virustotal.github.io/yara/"),
    t("cuckoo-sandbox", "Cuckoo Sandbox", TOOL, EH, "Runs suspicious files in an isolated VM and reports what they do.", None, "https://cuckoosandbox.org"),
    t("virustotal", "VirusTotal", PLAT, EH, "Scans files and URLs with dozens of antivirus engines at once.", "VirusTotal", "https://www.virustotal.com"),
    t("splunk", "Splunk", PLAT, SEC, "A log analytics platform widely used as a SIEM.", "Splunk", "https://www.splunk.com"),
    t("wazuh", "Wazuh", PLAT, SEC, "Open-source SIEM and endpoint security monitoring.", None, "https://wazuh.com"),
    t("zeek", "Zeek", TOOL, SEC, "A network monitor that turns traffic into rich, searchable logs.", "Zeek", "https://zeek.org"),
    t("suricata", "Suricata", TOOL, SEC, "A high-performance open-source IDS and IPS engine.", "Suricata (software)", "https://suricata.io"),
    t("hack-the-box", "Hack The Box", PLAT, EH, "An online platform of vulnerable machines and CTF challenges for practice.", None, "https://www.hackthebox.com"),
    t("tryhackme", "TryHackMe", PLAT, EH, "Guided, browser-based hacking labs for beginners and up.", None, "https://tryhackme.com"),
    t("hackerone", "HackerOne", PLAT, EH, "A bug bounty and vulnerability disclosure platform.", "HackerOne", "https://www.hackerone.com"),
]

H = "ethical-hacking"
EDGES = [
    *(e(n["id"], "belongs_to_domain", n["primary_domain"]) for n in CONCEPTS + TECHNOLOGIES),
    # The practice
    e(C(H), R, C("penetration-testing")),
    e(C(H), R, C("red-teaming")),
    e(C(H), R, C("bug-bounty")),
    e(C(H), R, C("capture-the-flag")),
    e(C(H), R, C("reconnaissance")),
    e(C(H), R, C("social-engineering")),
    e(C(H), R, C("web-application-security")),
    e(C(H), R, C("threat-modeling")),
    e(C("bug-bounty"), R, C("responsible-disclosure")),
    e(C("responsible-disclosure"), R, C("cve")),
    e(C("cve"), R, C("cvss")),
    e(C("cve"), R, C("vulnerability-assessment")),
    e(C("vulnerability-assessment"), R, C("penetration-testing")),
    e(C("red-teaming"), R, C("purple-teaming")),
    e(C("blue-teaming"), R, C("purple-teaming")),
    e(C("red-teaming"), R, C("mitre-attack")),
    e(C("red-teaming"), R, C("penetration-testing")),
    e(C("red-teaming"), R, C("ai-red-teaming")),
    e(C("red-teaming"), R, C("command-and-control")),
    e(C("blue-teaming"), R, C("security-operations-center")),
    e(C("blue-teaming"), R, C("incident-response")),
    e(C("blue-teaming"), R, C("threat-intelligence")),
    e(C("purple-teaming"), R, C("mitre-attack")),
    e(C("mitre-attack"), R, C("cyber-kill-chain")),
    e(C("mitre-attack"), R, C("threat-intelligence")),
    e(C("security-operations-center"), R, C("siem")),
    e(C("security-operations-center"), R, C("incident-response")),
    e(C("incident-response"), R, C("digital-forensics")),
    e(C("incident-response"), R, C("incident-management")),
    e(C("endpoint-detection-and-response"), R, C("intrusion-detection")),
    e(C("endpoint-detection-and-response"), R, C("security-operations-center")),
    e(C("honeypot"), R, C("intrusion-detection")),
    e(C("honeypot"), R, C("threat-intelligence")),
    e(C("capture-the-flag"), R, C("binary-exploitation")),
    e(C("capture-the-flag"), R, C("reverse-engineering")),
    e(C("capture-the-flag"), R, C("cryptography")),
    e(C("capture-the-flag"), R, C("steganography")),
    # Recon
    e(C("reconnaissance"), R, C("osint")),
    e(C("reconnaissance"), R, C("network-scanning")),
    e(C("reconnaissance"), R, C("cyber-kill-chain")),
    e(C("osint"), R, C("google-dorking")),
    e(C("osint"), R, C("social-engineering")),
    e(C("osint"), R, C("threat-intelligence")),
    e(C("network-scanning"), R, C("tcp-ip")),
    e(C("network-scanning"), R, C("vulnerability-assessment")),
    # Web
    e(C("web-application-security"), R, C("sql-injection")),
    e(C("web-application-security"), R, C("xss")),
    e(C("web-application-security"), R, C("csrf")),
    e(C("web-application-security"), R, C("ssrf")),
    e(C("web-application-security"), R, C("idor")),
    e(C("web-application-security"), R, C("http")),
    e(C("web-application-security"), R, C("bug-bounty")),
    e(C("idor"), R, C("authorization")),
    # Binary and system
    e(C("exploit-development"), R, C("binary-exploitation")),
    e(C("exploit-development"), R, C("cve")),
    e(C("exploit-development"), R, C("fuzzing")),
    e(C("binary-exploitation"), R, C("buffer-overflow")),
    e(C("binary-exploitation"), R, C("return-oriented-programming")),
    e(C("binary-exploitation"), R, C("memory-safety")),
    e(C("privilege-escalation"), R, C("penetration-testing")),
    e(C("privilege-escalation"), R, C("lateral-movement")),
    e(C("lateral-movement"), R, C("active-directory-attacks")),
    e(C("lateral-movement"), R, C("command-and-control")),
    e(C("active-directory-attacks"), R, C("authentication")),
    # Credentials
    e(C("password-cracking"), R, C("hashing")),
    e(C("password-cracking"), R, C("brute-force-attack")),
    e(C("password-cracking"), R, C("rainbow-table")),
    e(C("password-cracking"), R, C("penetration-testing")),
    e(C("brute-force-attack"), R, C("mfa")),
    e(C("rainbow-table"), R, C("hashing")),
    # Network and wireless
    e(C("man-in-the-middle-attack"), R, C("packet-sniffing")),
    e(C("man-in-the-middle-attack"), R, C("tls")),
    e(C("packet-sniffing"), R, C("tcp-ip")),
    e(C("packet-sniffing"), R, C("intrusion-detection")),
    e(C("wireless-security"), R, C("wi-fi")),
    e(C("wireless-security"), R, C("bluetooth")),
    e(C("wireless-security"), R, C("man-in-the-middle-attack")),
    e(C("wireless-security"), R, C("password-cracking")),
    # People
    e(C("social-engineering"), R, C("phishing")),
    # Forensics and RE
    e(C("digital-forensics"), R, C("memory-forensics")),
    e(C("digital-forensics"), R, C("disk-forensics")),
    e(C("digital-forensics"), R, C("malware-analysis")),
    e(C("disk-forensics"), R, C("file-system")),
    e(C("memory-forensics"), R, C("malware-analysis")),
    e(C("memory-forensics"), R, C("memory-management")),
    e(C("reverse-engineering"), R, C("disassembly")),
    e(C("reverse-engineering"), R, C("decompilation")),
    e(C("reverse-engineering"), R, C("dynamic-analysis")),
    e(C("reverse-engineering"), R, C("exploit-development")),
    e(C("disassembly"), R, C("decompilation")),
    e(C("decompilation"), R, C("compiler-theory")),
    e(C("dynamic-analysis"), R, C("sandboxing")),
    e(C("dynamic-analysis"), R, C("malware-analysis")),
    e(C("malware-analysis"), R, C("disassembly")),
    e(C("malware-analysis"), R, C("threat-intelligence")),
    e(C("malware-analysis"), R, C("command-and-control")),
    e(C("steganography"), R, C("digital-forensics")),
    # Tools
    e(T("kali-linux"), "built_on", T("linux")),
    e(T("parrot-os"), "built_on", T("linux")),
    e(T("kali-linux"), "alternative_to", T("parrot-os")),
    e(T("kali-linux"), "used_for", C("penetration-testing")),
    e(T("kali-linux"), "supports", C(H)),
    e(T("parrot-os"), "supports", C(H)),
    e(T("kali-linux"), "integrates_with", T("metasploit")),
    e(T("kali-linux"), "integrates_with", T("nmap")),
    e(T("maltego"), "used_for", C("osint")),
    e(T("shodan"), "used_for", C("osint")),
    e(T("shodan"), "supports", C("network-scanning")),
    e(T("theharvester"), "used_for", C("osint")),
    e(T("theharvester"), "written_in", T("python")),
    e(T("spiderfoot"), "used_for", C("osint")),
    e(T("spiderfoot"), "alternative_to", T("maltego")),
    e(T("nmap"), "used_for", C("network-scanning")),
    e(T("nmap"), "supports", C("reconnaissance")),
    e(T("sqlmap"), "used_for", C("sql-injection")),
    e(T("sqlmap"), "written_in", T("python")),
    e(T("burp-suite"), "used_for", C("web-application-security")),
    e(T("owasp-zap"), "used_for", C("web-application-security")),
    e(T("ffuf"), "used_for", C("web-application-security")),
    e(T("ffuf"), "written_in", T("go")),
    e(T("nuclei"), "used_for", C("vulnerability-assessment")),
    e(T("nuclei"), "written_in", T("go")),
    e(T("nessus"), "used_for", C("vulnerability-assessment")),
    e(T("openvas"), "used_for", C("vulnerability-assessment")),
    e(T("openvas"), "alternative_to", T("nessus")),
    e(T("metasploit"), "used_for", C("exploit-development")),
    e(T("hashcat"), "used_for", C("password-cracking")),
    e(T("hashcat"), "supports", C("brute-force-attack")),
    e(T("hashcat"), "integrates_with", T("cuda")),
    e(T("john-the-ripper"), "used_for", C("password-cracking")),
    e(T("john-the-ripper"), "alternative_to", T("hashcat")),
    e(T("hydra"), "used_for", C("brute-force-attack")),
    e(T("aircrack-ng"), "used_for", C("wireless-security")),
    e(T("aircrack-ng"), "supports", C("packet-sniffing")),
    e(T("bettercap"), "used_for", C("man-in-the-middle-attack")),
    e(T("bettercap"), "supports", C("wireless-security")),
    e(T("bettercap"), "written_in", T("go")),
    e(T("wireshark"), "used_for", C("packet-sniffing")),
    e(T("gophish"), "used_for", C("phishing")),
    e(T("gophish"), "supports", C("social-engineering")),
    e(T("bloodhound"), "used_for", C("active-directory-attacks")),
    e(T("bloodhound"), "integrates_with", T("neo4j")),
    e(T("mimikatz"), "used_for", C("active-directory-attacks")),
    e(T("mimikatz"), "supports", C("privilege-escalation")),
    e(T("sliver"), "used_for", C("command-and-control")),
    e(T("sliver"), "supports", C("red-teaming")),
    e(T("sliver"), "written_in", T("go")),
    e(T("ghidra"), "used_for", C("reverse-engineering")),
    e(T("ghidra"), "supports", C("decompilation")),
    e(T("ghidra"), "written_in", T("java")),
    e(T("ida-pro"), "used_for", C("reverse-engineering")),
    e(T("ida-pro"), "supports", C("disassembly")),
    e(T("ida-pro"), "alternative_to", T("ghidra")),
    e(T("radare2"), "used_for", C("reverse-engineering")),
    e(T("radare2"), "supports", C("disassembly")),
    e(T("radare2"), "written_in", T("c")),
    e(T("binary-ninja"), "used_for", C("reverse-engineering")),
    e(T("binary-ninja"), "alternative_to", T("ida-pro")),
    e(T("gdb"), "supports", C("dynamic-analysis")),
    e(T("gdb"), "supports", C("binary-exploitation")),
    e(T("gdb"), "integrates_with", T("gcc")),
    e(T("x64dbg"), "supports", C("dynamic-analysis")),
    e(T("x64dbg"), "used_for", C("malware-analysis")),
    e(T("frida"), "supports", C("dynamic-analysis")),
    e(T("frida"), "used_for", C("reverse-engineering")),
    e(T("pwntools"), "used_for", C("binary-exploitation")),
    e(T("pwntools"), "supports", C("capture-the-flag")),
    e(T("pwntools"), "written_in", T("python")),
    e(T("pwntools"), "integrates_with", T("gdb")),
    e(T("autopsy"), "used_for", C("disk-forensics")),
    e(T("autopsy"), "supports", C("digital-forensics")),
    e(T("volatility"), "used_for", C("memory-forensics")),
    e(T("volatility"), "written_in", T("python")),
    e(T("yara"), "used_for", C("malware-analysis")),
    e(T("yara"), "supports", C("threat-intelligence")),
    e(T("cuckoo-sandbox"), "used_for", C("malware-analysis")),
    e(T("cuckoo-sandbox"), "supports", C("dynamic-analysis")),
    e(T("cuckoo-sandbox"), "implements", C("sandboxing")),
    e(T("virustotal"), "used_for", C("malware-analysis")),
    e(T("virustotal"), "integrates_with", T("yara")),
    e(T("splunk"), "implements", C("siem")),
    e(T("splunk"), "supports", C("security-operations-center")),
    e(T("wazuh"), "implements", C("siem")),
    e(T("wazuh"), "supports", C("endpoint-detection-and-response")),
    e(T("wazuh"), "alternative_to", T("splunk")),
    e(T("wazuh"), "integrates_with", T("elasticsearch")),
    e(T("zeek"), "supports", C("intrusion-detection")),
    e(T("zeek"), "supports", C("packet-sniffing")),
    e(T("suricata"), "implements", C("intrusion-detection")),
    e(T("suricata"), "alternative_to", T("snort")),
    e(T("hack-the-box"), "supports", C("capture-the-flag")),
    e(T("hack-the-box"), "supports", C(H)),
    e(T("tryhackme"), "supports", C("capture-the-flag")),
    e(T("tryhackme"), "alternative_to", T("hack-the-box")),
    e(T("hackerone"), "used_for", C("bug-bounty")),
    e(T("hackerone"), "supports", C("responsible-disclosure")),
]

# Cross-field links that keep the cluster tied into networking and systems.
EDGES += [
    e(C("network-scanning"), R, C("osi-model")),
    e(C("packet-sniffing"), R, C("packet-switching")),
]

EDGES += [e(SEC, "has_subdomain", EH)]


def restructure() -> None:
    """Add the Ethical Hacking sub-field under Security and move existing nodes into it."""
    def rw(name, fn):
        p = SEED / name
        p.write_text(json.dumps(fn(json.loads(p.read_text(encoding="utf-8"))), indent=2,
                                ensure_ascii=False) + "\n", encoding="utf-8")

    def move(nodes):
        for n in nodes:
            if n["id"] in MOVES:
                n["primary_domain"] = MOVES[n["id"]]
        return nodes

    def fix_edges(edges):
        return [x for x in edges if not (x["relationship_type"] == "belongs_to_domain"
                and x["source"] in MOVES and x["target"] == SEC)] + \
            [e(nid, "belongs_to_domain", EH) for nid in MOVES]

    rw("domains.json", lambda d: d if any(x["id"] == EH for x in d) else d + [NEW_DOMAIN])
    rw("concepts.json", move)
    rw("technologies.json", move)
    rw("edges.json", fix_edges)


if __name__ == "__main__":
    restructure()
    apply_batch("ethical_hacking", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
