#!/usr/bin/env python3
"""Phase 1F expansion: Blockchain & Web3 and Internet of Things as top-level domains.

Each gets its anchor, core concepts and main technologies, linked to existing nodes
(hashing, signatures, consensus, distributed systems, Rust/Go/TypeScript/Python,
microcontrollers, edge computing, the existing message-broker / pub-sub concept, AWS). Solidity moves from Backend
into Blockchain rather than being duplicated.
"""
from __future__ import annotations

import json

from _apply import SEED, apply_batch

BC = "domain:blockchain"
IOT = "domain:iot"

DOMAINS = [
    {"id": BC, "slug": "blockchain-web3", "name": "Blockchain & Web3", "node_type": "domain",
     "primary_domain": BC,
     "short_description": "Shared ledgers secured by cryptography and consensus, and the "
                          "applications built on them.",
     "importance": 0.65, "lifecycle_status": "active"},
    {"id": IOT, "slug": "iot", "name": "Internet of Things & Devices", "node_type": "domain",
     "primary_domain": IOT,
     "short_description": "Connected sensors and devices that measure, communicate and act "
                          "on the physical world.",
     "importance": 0.65, "lifecycle_status": "active"},
]


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


CONCEPTS = [
    # --- Blockchain & Web3 ---
    c("blockchain", "Blockchain", "An append-only chain of blocks, each linked to the previous "
      "one by a cryptographic hash.", BC, importance=0.8, wikipedia_title="Blockchain"),
    c("distributed-ledger", "Distributed Ledger",
      "A database replicated and agreed upon across many independent nodes.", BC,
      importance=0.6, wikipedia_title="Distributed ledger"),
    c("proof-of-work", "Proof of Work",
      "Consensus by spending computation to propose the next block.", BC,
      aliases=["PoW"], importance=0.6, wikipedia_title="Proof of work"),
    c("proof-of-stake", "Proof of Stake",
      "Consensus by validators who lock up stake and risk losing it for misbehaving.", BC,
      aliases=["PoS"], importance=0.6, wikipedia_title="Proof of stake"),
    c("byzantine-fault-tolerance", "Byzantine Fault Tolerance",
      "Reaching agreement even when some participants lie or fail arbitrarily.", BC,
      aliases=["BFT"], importance=0.5, wikipedia_title="Byzantine fault"),
    c("merkle-tree", "Merkle Tree",
      "A tree of hashes that proves a piece of data belongs to a larger set.", BC,
      importance=0.5, wikipedia_title="Merkle tree"),
    c("smart-contracts", "Smart Contracts",
      "Programs stored on a blockchain that run exactly as written.", BC,
      importance=0.65, wikipedia_title="Smart contract"),
    c("cryptocurrency", "Cryptocurrency",
      "Digital money whose ownership is recorded on a blockchain.", BC,
      importance=0.65, wikipedia_title="Cryptocurrency"),
    c("crypto-wallet", "Cryptocurrency Wallet",
      "Software or hardware that holds the keys used to sign transactions.", BC,
      importance=0.45, wikipedia_title="Cryptocurrency wallet"),
    c("decentralized-finance", "Decentralized Finance",
      "Lending, trading and other financial services run by smart contracts.", BC,
      aliases=["DeFi"], importance=0.45, wikipedia_title="Decentralized finance"),
    c("layer-2-scaling", "Layer 2 Scaling",
      "Processing transactions off the main chain and settling the results on it.", BC,
      aliases=["Rollups"], importance=0.4),
    # --- Internet of Things ---
    c("internet-of-things", "Internet of Things",
      "Everyday physical devices connected to the internet to sense and act.", IOT,
      aliases=["IoT"], importance=0.75, wikipedia_title="Internet of things"),
    c("mqtt", "MQTT", "A lightweight publish-subscribe messaging protocol for devices.", IOT,
      node_subtype="protocol", importance=0.6, wikipedia_title="MQTT"),
    c("zigbee", "Zigbee", "A low-power mesh radio protocol for home and sensor networks.", IOT,
      node_subtype="protocol", importance=0.45, wikipedia_title="Zigbee"),
    c("lorawan", "LoRaWAN", "A long-range, low-power wide-area network protocol for sensors.",
      IOT, node_subtype="protocol", importance=0.4, wikipedia_title="LoRa"),
    c("digital-twin", "Digital Twin",
      "A live virtual model of a physical object kept in sync with its sensor data.", IOT,
      importance=0.45, wikipedia_title="Digital twin"),
    c("home-automation", "Home Automation",
      "Controlling lights, heating and appliances in a home through connected devices.", IOT,
      aliases=["Smart home"], importance=0.45, wikipedia_title="Home automation"),
    c("industrial-iot", "Industrial IoT",
      "Connected sensors and machines in factories, energy and logistics.", IOT,
      aliases=["IIoT"], importance=0.45, wikipedia_title="Industrial internet of things"),
]

TECHNOLOGIES = [
    # --- Blockchain & Web3 ---
    t("bitcoin", "Bitcoin", "platform",
      "The first cryptocurrency, secured by a proof-of-work blockchain.", BC,
      official_url="https://bitcoin.org", documentation_url="https://developer.bitcoin.org",
      wikipedia_title="Bitcoin"),
    t("ethereum", "Ethereum", "platform",
      "A proof-of-stake blockchain that runs smart contracts.", BC,
      official_url="https://ethereum.org",
      documentation_url="https://ethereum.org/developers/docs", wikipedia_title="Ethereum"),
    t("solana", "Solana", "platform",
      "A high-throughput blockchain for smart contracts.", BC,
      official_url="https://solana.com", documentation_url="https://solana.com/docs",
      wikipedia_title="Solana (blockchain platform)"),
    t("hardhat", "Hardhat", "developer_tool",
      "A development environment for compiling, testing and deploying Ethereum contracts.",
      BC, official_url="https://hardhat.org", documentation_url="https://hardhat.org/docs"),
    t("foundry", "Foundry", "developer_tool",
      "A fast Rust-based toolkit for building and testing Ethereum contracts.", BC,
      official_url="https://getfoundry.sh", documentation_url="https://book.getfoundry.sh"),
    t("ethers-js", "ethers.js", "library",
      "A JavaScript library for talking to Ethereum and its wallets.", BC,
      official_url="https://ethers.org", documentation_url="https://docs.ethers.org"),
    t("metamask", "MetaMask", "platform",
      "A browser and mobile wallet for Ethereum and compatible chains.", BC,
      official_url="https://metamask.io", documentation_url="https://docs.metamask.io",
      wikipedia_title="MetaMask"),
    t("ipfs", "IPFS", "platform",
      "A peer-to-peer network for storing and sharing content by its hash.", BC,
      official_url="https://ipfs.tech", documentation_url="https://docs.ipfs.tech",
      wikipedia_title="InterPlanetary File System"),
    # --- Internet of Things ---
    t("arduino", "Arduino", "platform",
      "Open-source microcontroller boards and the IDE used to program them.", IOT,
      official_url="https://www.arduino.cc", documentation_url="https://docs.arduino.cc",
      wikipedia_title="Arduino"),
    t("raspberry-pi", "Raspberry Pi", "platform",
      "Low-cost single-board Linux computers popular for devices and prototypes.", IOT,
      official_url="https://www.raspberrypi.com",
      documentation_url="https://www.raspberrypi.com/documentation/",
      wikipedia_title="Raspberry Pi"),
    t("mosquitto", "Eclipse Mosquitto", "developer_tool",
      "An open-source MQTT message broker.", IOT,
      official_url="https://mosquitto.org", documentation_url="https://mosquitto.org/documentation/"),
    t("node-red", "Node-RED", "developer_tool",
      "A visual flow editor for wiring devices, APIs and services together.", IOT,
      official_url="https://nodered.org", documentation_url="https://nodered.org/docs/",
      wikipedia_title="Node-RED"),
    t("home-assistant", "Home Assistant", "platform",
      "Open-source home automation software that runs locally.", IOT,
      official_url="https://www.home-assistant.io",
      documentation_url="https://www.home-assistant.io/docs/",
      wikipedia_title="Home Assistant"),
    t("aws-iot-core", "AWS IoT Core", "cloud_service",
      "AWS's managed service for connecting devices and routing their messages.", IOT,
      official_url="https://aws.amazon.com/iot-core/",
      documentation_url="https://docs.aws.amazon.com/iot/"),
]

# Existing nodes that belong in a new domain.
MOVED = {"technology:solidity": (BC, "domain:backend")}


def e(s, r, t_):
    return {"source": s, "target": t_, "relationship_type": r}


EDGES = [
    e("domain:software-engineering", "has_subdomain", BC),
    e("domain:software-engineering", "has_subdomain", IOT),
    *(e(n["id"], "belongs_to_domain", n["primary_domain"]) for n in CONCEPTS + TECHNOLOGIES),
    *(e(nid, "belongs_to_domain", new) for nid, (new, _) in MOVED.items()),
    # blockchain foundations
    e("concept:blockchain", "related_to", "concept:distributed-ledger"),
    e("concept:blockchain", "related_to", "concept:distributed-systems"),
    e("concept:hashing", "enables", "concept:merkle-tree"),
    e("concept:merkle-tree", "enables", "concept:blockchain"),
    e("concept:proof-of-work", "related_to", "concept:consensus"),
    e("concept:proof-of-stake", "related_to", "concept:consensus"),
    e("concept:proof-of-work", "alternative_to", "concept:proof-of-stake"),
    e("concept:byzantine-fault-tolerance", "related_to", "concept:consensus"),
    e("concept:cryptocurrency", "related_to", "concept:blockchain"),
    e("concept:crypto-wallet", "related_to", "concept:public-key-cryptography"),
    e("concept:digital-signature", "enables", "concept:crypto-wallet"),
    e("concept:smart-contracts", "related_to", "concept:blockchain"),
    e("concept:decentralized-finance", "related_to", "concept:smart-contracts"),
    e("concept:layer-2-scaling", "related_to", "concept:blockchain"),
    # chains and tools
    e("technology:bitcoin", "implements", "concept:blockchain"),
    e("technology:bitcoin", "implements", "concept:proof-of-work"),
    e("technology:bitcoin", "used_for", "concept:cryptocurrency"),
    e("technology:ethereum", "implements", "concept:blockchain"),
    e("technology:ethereum", "implements", "concept:proof-of-stake"),
    e("technology:ethereum", "supports", "concept:smart-contracts"),
    e("technology:ethereum", "used_for", "concept:decentralized-finance"),
    e("technology:solana", "implements", "concept:blockchain"),
    e("technology:solana", "supports", "concept:smart-contracts"),
    e("technology:solana", "written_in", "technology:rust"),
    e("technology:solana", "alternative_to", "technology:ethereum"),
    e("technology:solidity", "used_for", "concept:smart-contracts"),
    e("technology:solidity", "part_of_ecosystem", "technology:ethereum"),
    e("technology:hardhat", "used_for", "concept:smart-contracts"),
    e("technology:hardhat", "commonly_used_with", "technology:solidity"),
    e("technology:hardhat", "written_in", "technology:typescript"),
    e("technology:foundry", "alternative_to", "technology:hardhat"),
    e("technology:foundry", "written_in", "technology:rust"),
    e("technology:ethers-js", "part_of_ecosystem", "technology:ethereum"),
    e("technology:ethers-js", "written_in", "technology:typescript"),
    e("technology:metamask", "implements", "concept:crypto-wallet"),
    e("technology:metamask", "part_of_ecosystem", "technology:ethereum"),
    e("technology:ipfs", "commonly_used_with", "technology:ethereum"),
    e("technology:ipfs", "written_in", "technology:go"),
    # IoT foundations
    e("concept:internet-of-things", "related_to", "concept:edge-computing"),
    e("concept:internet-of-things", "related_to", "concept:microcontroller"),
    e("concept:internet-of-things", "related_to", "concept:digital-twin"),
    e("concept:industrial-iot", "related_to", "concept:internet-of-things"),
    e("concept:digital-twin", "related_to", "concept:industrial-iot"),
    e("concept:home-automation", "related_to", "concept:internet-of-things"),
    e("concept:mqtt", "related_to", "concept:message-broker"),
    e("concept:mqtt", "related_to", "concept:internet-of-things"),
    e("concept:zigbee", "related_to", "concept:home-automation"),
    e("concept:lorawan", "related_to", "concept:internet-of-things"),
    # IoT technologies
    e("technology:arduino", "related_to", "concept:microcontroller"),
    e("technology:esp32", "commonly_used_with", "technology:arduino"),
    e("technology:raspberry-pi", "used_for", "concept:internet-of-things"),
    e("technology:raspberry-pi", "commonly_used_with", "technology:python"),
    e("technology:mosquitto", "implements", "concept:mqtt"),
    e("technology:node-red", "built_on", "technology:nodejs"),
    e("technology:node-red", "supports", "concept:mqtt"),
    e("technology:home-assistant", "written_in", "technology:python"),
    e("technology:home-assistant", "used_for", "concept:home-automation"),
    e("technology:home-assistant", "supports", "concept:zigbee"),
    e("technology:home-assistant", "supports", "concept:mqtt"),
    e("technology:aws-iot-core", "part_of_ecosystem", "technology:aws"),
    e("technology:aws-iot-core", "supports", "concept:mqtt"),
    e("technology:aws-iot-core", "used_for", "concept:internet-of-things"),
]


def _rewrite(name: str, fn) -> None:
    path = SEED / name
    data = fn(json.loads(path.read_text(encoding="utf-8")))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def add_domains_and_move() -> None:
    have = {d["id"] for d in json.loads((SEED / "domains.json").read_text(encoding="utf-8"))}
    _rewrite("domains.json", lambda ds: [*ds, *(d for d in DOMAINS if d["id"] not in have)])

    def move(nodes: list[dict]) -> list[dict]:
        for n in nodes:
            if n["id"] in MOVED:
                n["primary_domain"] = MOVED[n["id"]][0]
        return nodes
    _rewrite("technologies.json", move)
    _rewrite("edges.json", lambda es: [x for x in es if not (
        x["source"] in MOVED and x["relationship_type"] == "belongs_to_domain"
        and x["target"] == MOVED[x["source"]][1])])


if __name__ == "__main__":
    add_domains_and_move()
    apply_batch("blockchain_iot", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
