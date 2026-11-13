#!/usr/bin/env python3
"""Phase 1H expansion: Computer Engineering, HCI, interdisciplinary fields, and ~250 concepts.

1. New top-level fields: Computer Engineering, Human-Computer Interaction and
   Interdisciplinary Computing. Computer Architecture and Embedded Systems move under
   Computer Engineering (from Systems); Digital Design & VLSI and Signal Processing are new
   Computer Engineering sub-fields. Computational Biology, FinTech and Health Informatics are
   new Interdisciplinary sub-fields.
2. Existing nodes that belong to the new fields move there (HCI, interaction design,
   usability testing, bioinformatics, digital logic, HDL, ASIC ...).
3. ~250 curated concepts and a handful of technologies, each with typed edges.

Run from scripts/expand:  python big_expansion.py   (idempotent; re-running is a no-op)
"""
from __future__ import annotations

import json

from _apply import SEED, apply_batch

CE, DD, SP = "domain:computer-engineering", "domain:digital-design", "domain:signal-processing"
ARCH, EMB = "domain:computer-architecture", "domain:embedded"
HCI, IX = "domain:hci", "domain:interdisciplinary"
BIO, FIN, MED = "domain:computational-biology", "domain:fintech", "domain:health-informatics"
AI, TH, SE, SYS = "domain:ai-ml", "domain:theory", "domain:software-engineering", "domain:systems"
NET, SEC, DB, OPS = "domain:networks", "domain:security", "domain:databases", "domain:cloud-devops"
ROB, QC, CG, GAME = "domain:robotics", "domain:quantum", "domain:computer-graphics", "domain:gamedev"
CHAIN, IOT = "domain:blockchain", "domain:iot"

NEW_DOMAINS = [
    {"id": CE, "slug": "computer-engineering", "name": "Computer Engineering",
     "short_description": "Where hardware meets software: processors, digital circuits, "
                          "embedded devices and signals.", "importance": 0.85},
    {"id": HCI, "slug": "hci", "name": "HCI & Interaction Design",
     "short_description": "How people perceive, use and are affected by computing systems, "
                          "and how to design for them.", "importance": 0.75},
    {"id": IX, "slug": "interdisciplinary", "name": "Interdisciplinary Computing",
     "short_description": "Computing applied to other fields: biology, finance, medicine, "
                          "science, society and the arts.", "importance": 0.75},
    {"id": DD, "slug": "digital-design", "name": "Digital Design & VLSI",
     "short_description": "Designing digital circuits and chips, from logic gates to "
                          "fabricated silicon.", "importance": 0.65},
    {"id": SP, "slug": "signal-processing", "name": "Signal Processing",
     "short_description": "Analysing and transforming signals such as audio, images and "
                          "radio, and the maths of communication.", "importance": 0.65},
    {"id": BIO, "slug": "computational-biology", "name": "Computational Biology",
     "short_description": "Algorithms and models for genomes, proteins and living systems.",
     "importance": 0.6},
    {"id": FIN, "slug": "fintech", "name": "FinTech & Computational Finance",
     "short_description": "Software for money: payments, trading, risk and financial "
                          "regulation.", "importance": 0.6},
    {"id": MED, "slug": "health-informatics", "name": "Health Informatics",
     "short_description": "Computing in healthcare: records, imaging, clinical decisions "
                          "and medical devices.", "importance": 0.6},
]
for _d in NEW_DOMAINS:
    _d.update({"node_type": "domain", "primary_domain": _d["id"], "lifecycle_status": "active"})

# (child, new parent). Architecture and Embedded leave Systems for Computer Engineering.
SUBDOMAINS = [
    ("domain:software-engineering", CE), ("domain:software-engineering", HCI),
    ("domain:software-engineering", IX),
    (CE, ARCH), (CE, EMB), (CE, DD), (CE, SP), (IX, BIO), (IX, FIN), (IX, MED),
]
REPARENT = {ARCH: (SYS, CE), EMB: (SYS, CE)}

# Existing nodes whose home is now one of the new fields.
MOVES = {
    "concept:human-computer-interaction": HCI, "concept:interaction-design": HCI,
    "concept:usability-testing": HCI, "concept:bioinformatics": BIO,
    "concept:digital-logic": DD, "concept:combinational-logic": DD,
    "concept:sequential-logic": DD, "concept:hdl": DD, "concept:asic": DD,
    "technology:verilog": DD, "technology:vhdl": DD, "technology:fpga": DD,
    "concept:scientific-computing": IX,
}


def c(slug, name, domain, desc, wiki=None, imp=0.45, aliases=None, subtype=None):
    node = {"id": f"concept:{slug}", "slug": slug, "name": name, "node_type": "concept",
            "primary_domain": domain, "short_description": desc, "importance": imp}
    if wiki:
        node["wikipedia_title"] = wiki
    if aliases:
        node["aliases"] = aliases
    if subtype:
        node["node_subtype"] = subtype
    return node


def t(slug, name, subtype, domain, desc, wiki=None, url=None):
    node = {"id": f"technology:{slug}", "slug": slug, "name": name, "node_type": "technology",
            "node_subtype": subtype, "primary_domain": domain, "short_description": desc,
            "lifecycle_status": "active"}
    if wiki:
        node["wikipedia_title"] = wiki
    if url:
        node["official_url"] = url
    return node


CONCEPTS = [
    # ---------------- Computer architecture ----------------
    c("cache-coherence", "Cache Coherence", ARCH, "Keeping every core's cached copy of shared memory consistent.", "Cache coherence", 0.55),
    c("simultaneous-multithreading", "Simultaneous Multithreading", ARCH, "Running several hardware threads on one core to fill idle execution units.", "Simultaneous multithreading", 0.45, ["SMT", "Hyper-Threading"]),
    c("vliw", "VLIW", ARCH, "Very long instruction words: the compiler, not the chip, schedules parallel operations.", "Very long instruction word", 0.35, ["Very Long Instruction Word"]),
    c("risc", "RISC", ARCH, "Reduced instruction set computing: few, simple, fixed-length instructions.", "Reduced instruction set computer", 0.55, ["Reduced Instruction Set Computer"]),
    c("cisc", "CISC", ARCH, "Complex instruction set computing: rich, variable-length instructions such as x86.", "Complex instruction set computer", 0.45, ["Complex Instruction Set Computer"]),
    c("microarchitecture", "Microarchitecture", ARCH, "How a processor implements its instruction set: pipelines, caches and execution units.", "Microarchitecture", 0.55),
    c("instruction-level-parallelism", "Instruction-Level Parallelism", ARCH, "Executing independent instructions from one thread at the same time.", "Instruction-level parallelism", 0.45, ["ILP"]),
    c("speculative-execution", "Speculative Execution", ARCH, "Running instructions before it is certain they are needed, then discarding wrong guesses.", "Speculative execution", 0.45),
    c("tlb", "Translation Lookaside Buffer", ARCH, "A small cache of recent virtual-to-physical address translations.", "Translation lookaside buffer", 0.4, ["TLB"]),
    c("dram", "DRAM", ARCH, "Dynamic RAM: dense main memory that stores bits as charge and must be refreshed.", "Dynamic random-access memory", 0.5, ["Dynamic RAM"]),
    c("numa", "NUMA", ARCH, "Non-uniform memory access: memory closer to a socket is faster for that socket.", "Non-uniform memory access", 0.4, ["Non-Uniform Memory Access"]),
    c("vector-processor", "Vector Processor", ARCH, "A processor whose instructions operate on whole arrays of data at once.", "Vector processor", 0.4),
    c("hardware-accelerator", "Hardware Accelerator", ARCH, "Specialised hardware that runs one kind of workload far faster than a CPU.", "Hardware acceleration", 0.5),
    c("systolic-array", "Systolic Array", ARCH, "A grid of processing elements passing data rhythmically; the core of TPUs.", "Systolic array", 0.35),
    c("neuromorphic-computing", "Neuromorphic Computing", ARCH, "Chips modelled on neurons and synapses for efficient, event-driven computation.", "Neuromorphic engineering", 0.4),
    c("chiplet", "Chiplets", ARCH, "Building one processor from several smaller dies in a single package.", "Chiplet", 0.4),
    c("heterogeneous-computing", "Heterogeneous Computing", ARCH, "Combining CPUs, GPUs and accelerators so each task runs on the best fit.", "Heterogeneous computing", 0.45),
    # ---------------- Digital design & VLSI ----------------
    c("transistor", "Transistor", DD, "The semiconductor switch from which all digital logic is built.", "Transistor", 0.6),
    c("cmos", "CMOS", DD, "Complementary MOS: the low-power transistor technology behind nearly every chip.", "CMOS", 0.55),
    c("boolean-algebra", "Boolean Algebra", DD, "The algebra of true and false that underlies logic circuits.", "Boolean algebra", 0.55),
    c("karnaugh-map", "Karnaugh Map", DD, "A grid method for simplifying Boolean expressions by hand.", "Karnaugh map", 0.35, ["K-map"]),
    c("flip-flop", "Flip-Flop", DD, "A clocked circuit that stores one bit; the building block of registers.", "Flip-flop (electronics)", 0.45),
    c("register-transfer-level", "Register-Transfer Level", DD, "Describing hardware as data moving between registers each clock cycle.", "Register-transfer level", 0.45, ["RTL"]),
    c("logic-synthesis", "Logic Synthesis", DD, "Automatically turning an RTL description into a netlist of gates.", "Logic synthesis", 0.4),
    c("high-level-synthesis", "High-Level Synthesis", DD, "Generating hardware from C, C++ or similar high-level code.", "High-level synthesis", 0.35, ["HLS"]),
    c("static-timing-analysis", "Static Timing Analysis", DD, "Checking that every signal path meets the clock deadline without simulation.", "Static timing analysis", 0.35, ["STA"]),
    c("place-and-route", "Place and Route", DD, "Positioning gates on the die and wiring them together.", "Place and route", 0.35),
    c("clock-domain-crossing", "Clock Domain Crossing", DD, "Safely passing signals between parts of a chip driven by different clocks.", "Clock domain crossing", 0.3),
    c("design-for-testability", "Design for Testability", DD, "Adding structures such as scan chains so fabricated chips can be tested.", "Design for testing", 0.3, ["DFT"]),
    c("hardware-verification", "Hardware Verification", DD, "Proving or testing that a chip design matches its specification before tape-out.", "Functional verification", 0.4),
    c("electronic-design-automation", "Electronic Design Automation", DD, "Software tools for designing, simulating and verifying chips and boards.", "Electronic design automation", 0.45, ["EDA"]),
    c("system-on-chip", "System on a Chip", DD, "A whole computer (cores, memory controllers, I/O) on one die.", "System on a chip", 0.55, ["SoC"]),
    c("semiconductor-fabrication", "Semiconductor Fabrication", DD, "Manufacturing chips through lithography, deposition and etching.", "Semiconductor device fabrication", 0.45),
    c("vlsi", "VLSI", DD, "Very-large-scale integration: putting billions of transistors on one chip.", "Very Large Scale Integration", 0.55, ["Very-Large-Scale Integration"]),
    c("low-power-design", "Low-Power Design", DD, "Techniques such as clock gating and voltage scaling that cut chip energy use.", "Low-power electronics", 0.35),
    # ---------------- Signal processing ----------------
    c("digital-signal-processing", "Digital Signal Processing", SP, "Analysing and modifying sampled signals with algorithms.", "Digital signal processing", 0.6, ["DSP"]),
    c("fourier-transform", "Fourier Transform", SP, "Decomposing a signal into the frequencies that make it up.", "Fourier transform", 0.6),
    c("fast-fourier-transform", "Fast Fourier Transform", SP, "An O(n log n) algorithm for the discrete Fourier transform.", "Fast Fourier transform", 0.55, ["FFT"]),
    c("sampling-theorem", "Sampling Theorem", SP, "Sampling above twice the highest frequency captures a signal exactly.", "Nyquist–Shannon sampling theorem", 0.5, ["Nyquist–Shannon theorem"]),
    c("z-transform", "Z-Transform", SP, "The discrete-time counterpart of the Laplace transform, used to analyse filters.", "Z-transform", 0.35),
    c("digital-filter", "Digital Filter", SP, "An algorithm that removes or emphasises parts of a signal's spectrum.", "Digital filter", 0.45, ["FIR filter", "IIR filter"]),
    c("convolution", "Convolution", SP, "Sliding one function over another and summing the products.", "Convolution", 0.55),
    c("modulation", "Modulation", SP, "Encoding information onto a carrier wave (AM, FM, QAM ...).", "Modulation", 0.45),
    c("analog-to-digital-conversion", "Analog-to-Digital Conversion", SP, "Turning a continuous voltage into numbers a computer can process.", "Analog-to-digital converter", 0.45, ["ADC"]),
    c("wavelet-transform", "Wavelet Transform", SP, "Analysing a signal at several scales at once; used in JPEG 2000.", "Wavelet transform", 0.35),
    c("image-processing", "Image Processing", SP, "Algorithms that enhance, filter or analyse digital images.", "Digital image processing", 0.55),
    c("audio-signal-processing", "Audio Signal Processing", SP, "Processing sound: effects, compression, noise reduction and analysis.", "Audio signal processing", 0.45),
    c("software-defined-radio", "Software-Defined Radio", SP, "Radio systems whose modulation and filtering run in software.", "Software-defined radio", 0.4, ["SDR"]),
    c("ofdm", "OFDM", SP, "Splitting data across many closely spaced carriers; used by Wi-Fi and 4G/5G.", "Orthogonal frequency-division multiplexing", 0.4, ["Orthogonal Frequency-Division Multiplexing"]),
    c("mimo", "MIMO", SP, "Using multiple antennas on both ends to multiply wireless throughput.", "MIMO", 0.4, ["Multiple-Input Multiple-Output"]),
    c("compressed-sensing", "Compressed Sensing", SP, "Recovering sparse signals from far fewer samples than usual.", "Compressed sensing", 0.3),
    c("adaptive-filter", "Adaptive Filter", SP, "A filter that tunes itself to changing signals, as in echo cancellation.", "Adaptive filter", 0.3),
    c("data-compression", "Data Compression", SP, "Representing information in fewer bits, losslessly or with acceptable loss.", "Data compression", 0.55),
    # ---------------- Embedded systems ----------------
    c("pwm", "Pulse-Width Modulation", EMB, "Controlling power by rapidly switching a signal on and off.", "Pulse-width modulation", 0.4, ["PWM"]),
    c("gpio", "GPIO", EMB, "General-purpose input/output pins that software can read or drive.", "General-purpose input/output", 0.4, ["General-Purpose I/O"]),
    c("direct-memory-access", "Direct Memory Access", EMB, "Letting peripherals move data to memory without the CPU copying it.", "Direct memory access", 0.45, ["DMA"]),
    c("watchdog-timer", "Watchdog Timer", EMB, "A timer that resets a device if its software stops responding.", "Watchdog timer", 0.3),
    c("bootloader", "Bootloader", EMB, "The first code that runs at power-on and loads the main program.", "Bootloader", 0.4),
    c("memory-mapped-io", "Memory-Mapped I/O", EMB, "Controlling devices by reading and writing special memory addresses.", "Memory-mapped I/O", 0.35, ["MMIO"]),
    c("embedded-linux", "Embedded Linux", EMB, "Linux trimmed and configured to run on devices rather than PCs.", "Embedded Linux", 0.4),
    c("hardware-abstraction-layer", "Hardware Abstraction Layer", EMB, "A software layer hiding hardware details behind a common interface.", "Hardware abstraction", 0.35, ["HAL"]),
    c("tinyml", "TinyML", EMB, "Running machine-learning models on microcontrollers with milliwatts of power.", "TinyML", 0.4),
    c("cyber-physical-systems", "Cyber-Physical Systems", EMB, "Computation tightly coupled to physical processes, like cars and power grids.", "Cyber-physical system", 0.45, ["CPS"]),
    c("jtag", "JTAG", EMB, "The standard debug and test port for chips and boards.", "JTAG", 0.3, subtype="standard"),
    # ---------------- Computer engineering (general) ----------------
    c("hardware-software-codesign", "Hardware/Software Co-Design", CE, "Designing hardware and software together to meet performance and power goals.", "Hardware/software co-design", 0.4),
    c("printed-circuit-board", "Printed Circuit Board", CE, "The board that mechanically supports and wires electronic components.", "Printed circuit board", 0.45, ["PCB"]),
    c("analog-circuit-design", "Analog Circuit Design", CE, "Designing amplifiers, filters and power circuits that handle continuous signals.", "Analogue electronics", 0.4),
    c("signal-integrity", "Signal Integrity", CE, "Keeping high-speed electrical signals clean as they travel through wires.", "Signal integrity", 0.3),
    # ---------------- Human-computer interaction ----------------
    c("user-centered-design", "User-Centered Design", HCI, "Designing iteratively around users' needs, tested with real users.", "User-centered design", 0.55, ["UCD"]),
    c("user-research", "User Research", HCI, "Studying users through interviews, observation and surveys to inform design.", "User research", 0.45),
    c("personas", "Personas", HCI, "Fictional but research-based users that keep a team focused on real needs.", "Persona (user experience)", 0.3),
    c("cognitive-load", "Cognitive Load", HCI, "The mental effort an interface demands; good design keeps it low.", "Cognitive load", 0.4),
    c("mental-model", "Mental Models", HCI, "What users believe about how a system works, right or wrong.", "Mental model", 0.35),
    c("fitts-law", "Fitts's Law", HCI, "Time to hit a target grows with distance and shrinks with target size.", "Fitts's law", 0.4),
    c("information-architecture", "Information Architecture", HCI, "Organising and labelling content so people can find their way.", "Information architecture", 0.4),
    c("ui-prototyping", "UI Prototyping", HCI, "Building quick mock-ups to test ideas before writing production code.", "Software prototyping", 0.4),
    c("heuristic-evaluation", "Heuristic Evaluation", HCI, "Experts inspecting an interface against usability principles.", "Heuristic evaluation", 0.35),
    c("eye-tracking", "Eye Tracking", HCI, "Measuring where people look to study attention or control interfaces.", "Eye tracking", 0.35),
    c("conversational-ui", "Conversational UI", HCI, "Interfaces you talk or chat with instead of clicking through.", "Conversational user interface", 0.45, ["Chatbot interface"]),
    c("voice-user-interface", "Voice User Interface", HCI, "Controlling systems by speaking, as with smart speakers.", "Voice user interface", 0.4, ["VUI"]),
    c("gesture-recognition", "Gesture Recognition", HCI, "Interpreting hand and body movements as input.", "Gesture recognition", 0.4),
    c("haptics", "Haptics", HCI, "Touch feedback such as vibration and force in devices and controllers.", "Haptic technology", 0.4),
    c("brain-computer-interface", "Brain-Computer Interface", HCI, "Direct communication between brain activity and a computer.", "Brain–computer interface", 0.45, ["BCI"]),
    c("cscw", "Computer-Supported Cooperative Work", HCI, "How technology supports people working together.", "Computer-supported cooperative work", 0.35, ["CSCW"]),
    c("ubiquitous-computing", "Ubiquitous Computing", HCI, "Computing woven invisibly into everyday objects and spaces.", "Ubiquitous computing", 0.4),
    c("affective-computing", "Affective Computing", HCI, "Systems that recognise, interpret or simulate human emotion.", "Affective computing", 0.35),
    c("dark-patterns", "Dark Patterns", HCI, "Interface tricks that push users into choices they did not intend.", "Dark pattern", 0.35),
    c("human-robot-interaction", "Human-Robot Interaction", HCI, "How people and robots communicate and work safely together.", "Human–robot interaction", 0.4, ["HRI"]),
    # ---------------- Interdisciplinary (general) ----------------
    c("computational-social-science", "Computational Social Science", IX, "Studying society with large-scale data and simulation.", "Computational social science", 0.4),
    c("digital-humanities", "Digital Humanities", IX, "Computational methods applied to history, literature and the arts.", "Digital humanities", 0.35),
    c("educational-technology", "Educational Technology", IX, "Software and data that support teaching and learning.", "Educational technology", 0.4, ["EdTech"]),
    c("computational-neuroscience", "Computational Neuroscience", IX, "Modelling how neurons and brains compute.", "Computational neuroscience", 0.4),
    c("climate-informatics", "Climate Informatics", IX, "Machine learning and data science for climate and weather science.", "Climate informatics", 0.35),
    c("geographic-information-systems", "Geographic Information Systems", IX, "Capturing, analysing and mapping spatial data.", "Geographic information system", 0.5, ["GIS"]),
    c("computational-chemistry", "Computational Chemistry", IX, "Simulating molecules and reactions with quantum and classical models.", "Computational chemistry", 0.4),
    c("computational-physics", "Computational Physics", IX, "Numerical simulation of physical systems.", "Computational physics", 0.4),
    c("smart-cities", "Smart Cities", IX, "Urban services run on sensors, networks and data.", "Smart city", 0.4),
    c("precision-agriculture", "Precision Agriculture", IX, "Using sensors, drones and data to farm field-by-field and plant-by-plant.", "Precision agriculture", 0.35),
    c("computational-law", "Computational Law", IX, "Representing and reasoning about legal rules with software.", "Computational law", 0.3, ["Legal tech"]),
    c("music-information-retrieval", "Music Information Retrieval", IX, "Extracting melody, rhythm and similarity from music audio and scores.", "Music information retrieval", 0.3, ["MIR"]),
    c("computational-linguistics", "Computational Linguistics", IX, "The scientific study of language with computational models.", "Computational linguistics", 0.45),
    c("sports-analytics", "Sports Analytics", IX, "Tracking and statistical modelling to evaluate players and tactics.", "Sports analytics", 0.3),
    c("smart-grid", "Smart Grid", IX, "Power grids that use sensing and control to balance supply and demand.", "Smart grid", 0.4),
    # ---------------- Computational biology ----------------
    c("genomics", "Genomics", BIO, "Sequencing and analysing whole genomes.", "Genomics", 0.55),
    c("sequence-alignment", "Sequence Alignment", BIO, "Lining up DNA or protein sequences to find similarity.", "Sequence alignment", 0.5),
    c("genome-assembly", "Genome Assembly", BIO, "Reconstructing a genome from millions of short sequencing reads.", "Sequence assembly", 0.4),
    c("next-generation-sequencing", "Next-Generation Sequencing", BIO, "Massively parallel DNA sequencing that made genomics cheap.", "Massive parallel sequencing", 0.45, ["NGS"]),
    c("phylogenetics", "Phylogenetics", BIO, "Inferring evolutionary trees from sequence data.", "Computational phylogenetics", 0.4),
    c("protein-structure-prediction", "Protein Structure Prediction", BIO, "Predicting a protein's 3D shape from its amino-acid sequence.", "Protein structure prediction", 0.5),
    c("gene-expression-analysis", "Gene Expression Analysis", BIO, "Measuring which genes are active, e.g. with RNA-seq.", "Gene expression profiling", 0.4),
    c("single-cell-analysis", "Single-Cell Analysis", BIO, "Measuring molecules cell by cell to map tissues and cell types.", "Single-cell analysis", 0.35),
    c("systems-biology", "Systems Biology", BIO, "Modelling biological systems as networks of interacting parts.", "Systems biology", 0.4),
    c("molecular-dynamics", "Molecular Dynamics", BIO, "Simulating how atoms and molecules move over time.", "Molecular dynamics", 0.45),
    c("computational-drug-discovery", "Computational Drug Discovery", BIO, "Screening and designing drug candidates in silico.", "Drug design", 0.45),
    c("biological-network-analysis", "Biological Network Analysis", BIO, "Graph analysis of protein, gene and metabolic interactions.", "Biological network", 0.3),
    # ---------------- FinTech ----------------
    c("algorithmic-trading", "Algorithmic Trading", FIN, "Trading by programmed rules instead of by hand.", "Algorithmic trading", 0.5),
    c("high-frequency-trading", "High-Frequency Trading", FIN, "Trading in microseconds, where network latency is the edge.", "High-frequency trading", 0.4, ["HFT"]),
    c("quantitative-finance", "Quantitative Finance", FIN, "Mathematical and statistical models for pricing and investing.", "Mathematical finance", 0.45, ["Quant finance"]),
    c("risk-modeling", "Financial Risk Modeling", FIN, "Estimating losses from market, credit and operational risk.", "Financial risk modeling", 0.4),
    c("payment-systems", "Payment Systems", FIN, "Card networks, real-time rails and processors that move money.", "Payment system", 0.5),
    c("open-banking", "Open Banking", FIN, "Banks sharing account data with third parties through APIs, with consent.", "Open banking", 0.4),
    c("fraud-detection", "Fraud Detection", FIN, "Spotting fraudulent transactions with rules and machine learning.", "Fraud", 0.45),
    c("credit-scoring", "Credit Scoring", FIN, "Statistical models that estimate how likely a borrower is to repay.", "Credit score", 0.35),
    c("robo-advisor", "Robo-Advisors", FIN, "Automated investment management driven by algorithms.", "Robo-advisor", 0.3),
    c("regtech", "RegTech", FIN, "Technology that automates regulatory compliance and reporting.", "Regulatory technology", 0.3),
    c("order-matching-engine", "Order Matching Engine", FIN, "The core of an exchange: pairs buy and sell orders by price and time.", "Order matching system", 0.35),
    c("cbdc", "Central Bank Digital Currency", FIN, "Digital money issued directly by a central bank.", "Central bank digital currency", 0.35, ["CBDC"]),
    # ---------------- Health informatics ----------------
    c("electronic-health-records", "Electronic Health Records", MED, "Digital patient records shared across a care system.", "Electronic health record", 0.5, ["EHR"]),
    c("health-data-interoperability", "Health Data Interoperability", MED, "Exchanging medical data between systems with standards like HL7 FHIR.", "Health information exchange", 0.4),
    c("medical-imaging", "Medical Imaging", MED, "Computing behind CT, MRI and ultrasound, from reconstruction to diagnosis.", "Medical imaging", 0.5),
    c("clinical-decision-support", "Clinical Decision Support", MED, "Software that gives clinicians patient-specific advice at the point of care.", "Clinical decision support system", 0.4),
    c("telemedicine", "Telemedicine", MED, "Delivering care remotely over video, messaging and monitoring.", "Telehealth", 0.4),
    c("wearable-health-monitoring", "Wearable Health Monitoring", MED, "Watches and patches that continuously track vital signs.", "Wearable technology", 0.4),
    c("precision-medicine", "Precision Medicine", MED, "Treatment tailored to each patient's genes, environment and lifestyle.", "Precision medicine", 0.4),
    c("hipaa", "HIPAA", MED, "The US law governing the privacy and security of health information.", "Health Insurance Portability and Accountability Act", 0.4, subtype="standard"),
    c("epidemiological-modeling", "Epidemiological Modeling", MED, "Simulating how diseases spread to guide public-health decisions.", "Mathematical modelling of infectious diseases", 0.4),
    c("medical-device-software", "Medical Device Software", MED, "Safety-critical software regulated as part of a medical device.", "Software as a medical device", 0.35),
    # ---------------- AI & ML ----------------
    c("hidden-markov-model", "Hidden Markov Model", AI, "A model of a system moving through unobserved states that emit observations.", "Hidden Markov model", 0.4, ["HMM"]),
    c("generative-adversarial-network", "Generative Adversarial Network", AI, "Two networks competing: one generates fakes, the other spots them.", "Generative adversarial network", 0.5, ["GAN"]),
    c("variational-autoencoder", "Variational Autoencoder", AI, "A generative model that learns a smooth latent space to sample from.", "Variational autoencoder", 0.4, ["VAE"]),
    c("recurrent-neural-network", "Recurrent Neural Network", AI, "Networks with loops that process sequences step by step.", "Recurrent neural network", 0.5, ["RNN"]),
    c("lstm", "LSTM", AI, "Long short-term memory: an RNN cell that remembers over long sequences.", "Long short-term memory", 0.45, ["Long Short-Term Memory"]),
    c("transfer-learning", "Transfer Learning", AI, "Reusing a model trained on one task as the starting point for another.", "Transfer learning", 0.5),
    c("federated-learning", "Federated Learning", AI, "Training on many devices' data without the data leaving the devices.", "Federated learning", 0.45),
    c("explainable-ai", "Explainable AI", AI, "Methods that make a model's decisions understandable to people.", "Explainable artificial intelligence", 0.5, ["XAI"]),
    c("ai-alignment", "AI Alignment", AI, "Making AI systems pursue the goals and values their designers intend.", "AI alignment", 0.5, ["AI safety"]),
    c("rlhf", "RLHF", AI, "Reinforcement learning from human feedback: tuning a model on human preferences.", "Reinforcement learning from human feedback", 0.45, ["Reinforcement Learning from Human Feedback"]),
    c("knowledge-graph", "Knowledge Graph", AI, "Facts stored as entities and typed relationships between them.", "Knowledge graph", 0.5),
    c("object-detection", "Object Detection", AI, "Finding and labelling objects with bounding boxes in images.", "Object detection", 0.5),
    c("image-segmentation", "Image Segmentation", AI, "Labelling every pixel of an image by the object it belongs to.", "Image segmentation", 0.45),
    c("speech-recognition", "Speech Recognition", AI, "Converting spoken audio into text.", "Speech recognition", 0.5, ["ASR"]),
    c("machine-translation", "Machine Translation", AI, "Automatically translating text between languages.", "Machine translation", 0.45),
    c("sentiment-analysis", "Sentiment Analysis", AI, "Detecting opinion and emotion in text.", "Sentiment analysis", 0.4),
    c("named-entity-recognition", "Named Entity Recognition", AI, "Finding names of people, places and organisations in text.", "Named-entity recognition", 0.35, ["NER"]),
    c("mixture-of-experts", "Mixture of Experts", AI, "Routing each input to a few specialised sub-networks to scale models cheaply.", "Mixture of experts", 0.4, ["MoE"]),
    c("model-quantization", "Model Quantization", AI, "Storing weights in fewer bits so models run faster and smaller.", "Quantization (signal processing)", 0.4),
    c("knowledge-distillation", "Knowledge Distillation", AI, "Training a small model to imitate a large one.", "Knowledge distillation", 0.35),
    c("anomaly-detection", "Anomaly Detection", AI, "Finding data points that do not fit the usual pattern.", "Anomaly detection", 0.45),
    c("time-series-forecasting", "Time-Series Forecasting", AI, "Predicting future values from past observations over time.", "Time series", 0.45),
    c("causal-inference", "Causal Inference", AI, "Working out cause and effect rather than mere correlation.", "Causal inference", 0.4),
    c("contrastive-learning", "Contrastive Learning", AI, "Learning representations by pulling similar pairs together and pushing others apart.", "Contrastive learning", 0.35),
    c("gradient-boosting", "Gradient Boosting", AI, "Building a strong model from many small decision trees, each fixing the last.", "Gradient boosting", 0.45),
    c("decision-trees", "Decision Trees", AI, "Models that predict by following a tree of yes/no questions.", "Decision tree learning", 0.45),
    c("support-vector-machine", "Support Vector Machine", AI, "A classifier that finds the widest margin between classes.", "Support vector machine", 0.4, ["SVM"]),
    c("k-means-clustering", "K-Means Clustering", AI, "Grouping data into k clusters around their means.", "K-means clustering", 0.4),
    c("dimensionality-reduction", "Dimensionality Reduction", AI, "Compressing many features into a few that keep the structure, e.g. PCA.", "Dimensionality reduction", 0.4, ["PCA"]),
    # ---------------- Theory & maths ----------------
    c("lambda-calculus", "Lambda Calculus", TH, "A minimal model of computation built only from functions.", "Lambda calculus", 0.45),
    c("graph-theory", "Graph Theory", TH, "The mathematics of nodes and edges.", "Graph theory", 0.6),
    c("discrete-mathematics", "Discrete Mathematics", TH, "Logic, sets, combinatorics and graphs: the maths of computing.", "Discrete mathematics", 0.55),
    c("linear-algebra", "Linear Algebra", TH, "Vectors, matrices and linear maps; the language of ML and graphics.", "Linear algebra", 0.6),
    c("probability-theory", "Probability Theory", TH, "The mathematics of uncertainty and randomness.", "Probability theory", 0.55),
    c("game-theory", "Game Theory", TH, "Modelling strategic decisions between rational agents.", "Game theory", 0.45),
    c("monte-carlo-methods", "Monte Carlo Methods", TH, "Estimating results by repeated random sampling.", "Monte Carlo method", 0.5),
    c("linear-programming", "Linear Programming", TH, "Optimising a linear objective under linear constraints.", "Linear programming", 0.4),
    c("convex-optimization", "Convex Optimization", TH, "Optimisation problems where every local minimum is global.", "Convex optimization", 0.45),
    c("kolmogorov-complexity", "Kolmogorov Complexity", TH, "The length of the shortest program that outputs a given string.", "Kolmogorov complexity", 0.3),
    c("amortized-analysis", "Amortized Analysis", TH, "Averaging an operation's cost over a whole sequence of operations.", "Amortized analysis", 0.35),
    c("string-matching", "String Matching", TH, "Finding patterns in text quickly, e.g. KMP and Boyer-Moore.", "String-searching algorithm", 0.4),
    c("network-flow", "Network Flow", TH, "Maximum flow and minimum cut problems on graphs.", "Network flow problem", 0.35, ["Max flow"]),
    c("bloom-filter", "Bloom Filter", TH, "A compact probabilistic set that may give false positives but never false negatives.", "Bloom filter", 0.4),
    # ---------------- Software engineering & languages ----------------
    c("type-inference", "Type Inference", SE, "Compilers working out types so programmers do not have to write them.", "Type inference", 0.4),
    c("generics", "Generic Programming", SE, "Writing code once that works for many types.", "Generic programming", 0.45, ["Generics"]),
    c("memory-safety", "Memory Safety", SE, "Freedom from bugs like buffer overflows and use-after-free.", "Memory safety", 0.5),
    c("ownership-and-borrowing", "Ownership and Borrowing", SE, "Rust's compile-time rules that guarantee memory safety without a GC.", "Rust (programming language)", 0.4),
    c("metaprogramming", "Metaprogramming", SE, "Programs that write or transform other programs, such as macros.", "Metaprogramming", 0.35),
    c("coroutines", "Coroutines", SE, "Functions that can pause and resume, the basis of async/await.", "Coroutine", 0.4),
    c("actor-model", "Actor Model", SE, "Concurrency through isolated actors that only communicate by messages.", "Actor model", 0.45),
    c("design-by-contract", "Design by Contract", SE, "Specifying preconditions, postconditions and invariants for code.", "Design by contract", 0.3),
    c("software-architecture", "Software Architecture", SE, "The high-level structure of a system and the trade-offs behind it.", "Software architecture", 0.55),
    c("requirements-engineering", "Requirements Engineering", SE, "Discovering, documenting and managing what a system must do.", "Requirements engineering", 0.4),
    c("just-in-time-compilation", "Just-in-Time Compilation", SYS, "Compiling code to machine code while the program runs.", "Just-in-time compilation", 0.45, ["JIT"]),
    c("interpreter", "Interpreter", SYS, "A program that executes code directly instead of compiling it first.", "Interpreter (computing)", 0.45),
    # ---------------- Systems & HPC ----------------
    c("amdahls-law", "Amdahl's Law", SYS, "The serial part of a program caps how much parallelism can speed it up.", "Amdahl's law", 0.45),
    c("supercomputer", "Supercomputer", SYS, "Machines with tens of thousands of nodes for the largest simulations.", "Supercomputer", 0.45),
    c("exascale-computing", "Exascale Computing", SYS, "Systems performing at least 10^18 floating-point operations per second.", "Exascale computing", 0.35),
    c("distributed-shared-memory", "Distributed Shared Memory", SYS, "Making separate machines' memory look like one shared address space.", "Distributed shared memory", 0.3),
    c("lock-free-data-structures", "Lock-Free Data Structures", SYS, "Concurrent structures that make progress without locks, using atomics.", "Non-blocking algorithm", 0.4),
    c("copy-on-write", "Copy-on-Write", SYS, "Sharing data until someone writes, then copying only what changed.", "Copy-on-write", 0.4),
    c("page-replacement", "Page Replacement", SYS, "Choosing which memory page to evict when RAM is full, e.g. LRU.", "Page replacement algorithm", 0.35),
    # ---------------- Networks ----------------
    c("osi-model", "OSI Model", NET, "The seven-layer reference model for network communication.", "OSI model", 0.55, subtype="standard"),
    c("subnetting", "Subnetting", NET, "Dividing an IP network into smaller networks with masks and CIDR.", "Subnet", 0.4, ["CIDR"]),
    c("vlan", "VLAN", NET, "Splitting one physical network into isolated virtual networks.", "VLAN", 0.4, ["Virtual LAN"]),
    c("vpn", "VPN", NET, "An encrypted tunnel that joins a device to a private network over the internet.", "Virtual private network", 0.5, ["Virtual Private Network"]),
    c("dhcp", "DHCP", NET, "Automatically handing out IP addresses to devices that join a network.", "Dynamic Host Configuration Protocol", 0.4, subtype="protocol"),
    c("arp", "ARP", NET, "Finding the hardware (MAC) address for an IP address on a local network.", "Address Resolution Protocol", 0.35, subtype="protocol"),
    c("peer-to-peer-networking", "Peer-to-Peer Networking", NET, "Networks where every node is both client and server.", "Peer-to-peer", 0.45, ["P2P"]),
    c("multicast", "Multicast", NET, "Sending one stream to many receivers at once.", "Multicast", 0.3),
    c("network-function-virtualization", "Network Function Virtualization", NET, "Running firewalls, routers and load balancers as software on servers.", "Network function virtualization", 0.35, ["NFV"]),
    c("mesh-networking", "Mesh Networking", NET, "Networks where nodes relay each other's traffic with no central hub.", "Mesh networking", 0.35),
    c("vehicle-to-everything", "Vehicle-to-Everything", NET, "Cars exchanging data with other cars, roads and infrastructure.", "Vehicular communication systems", 0.3, ["V2X"]),
    # ---------------- Security ----------------
    c("side-channel-attack", "Side-Channel Attack", SEC, "Extracting secrets from timing, power or other physical leakage.", "Side-channel attack", 0.45, ["Spectre", "Meltdown"]),
    c("trusted-execution-environment", "Trusted Execution Environment", SEC, "An isolated area of a processor that protects code and data even from the OS.", "Trusted execution environment", 0.4, ["TEE", "SGX"]),
    c("secure-boot", "Secure Boot", SEC, "Only booting firmware and OS images that carry a valid signature.", "UEFI", 0.35),
    c("hardware-security-module", "Hardware Security Module", SEC, "Tamper-resistant hardware that stores keys and performs crypto.", "Hardware security module", 0.35, ["HSM"]),
    c("fuzzing", "Fuzzing", SEC, "Feeding programs huge volumes of random or mutated input to find crashes.", "Fuzzing", 0.45),
    c("malware-analysis", "Malware Analysis", SEC, "Studying malicious software to understand and stop it.", "Malware analysis", 0.4),
    c("reverse-engineering", "Reverse Engineering", SEC, "Working out how software or hardware works from the finished product.", "Reverse engineering", 0.45),
    c("intrusion-detection", "Intrusion Detection", SEC, "Monitoring networks and hosts for attacks.", "Intrusion detection system", 0.45, ["IDS"]),
    c("buffer-overflow", "Buffer Overflow", SEC, "Writing past the end of a buffer to corrupt memory or hijack control.", "Buffer overflow", 0.45),
    c("csrf", "CSRF", SEC, "Cross-site request forgery: tricking a logged-in browser into sending requests.", "Cross-site request forgery", 0.4, ["Cross-Site Request Forgery"]),
    c("ddos-attack", "DDoS Attack", SEC, "Overwhelming a service with traffic from many machines.", "Denial-of-service attack", 0.45, ["Denial of service"]),
    c("phishing", "Phishing", SEC, "Fraudulent messages that trick people into revealing secrets.", "Phishing", 0.45),
    c("supply-chain-security", "Software Supply Chain Security", SEC, "Protecting dependencies, build systems and releases from tampering.", "Supply chain attack", 0.45, ["SBOM"]),
    c("siem", "SIEM", SEC, "Security information and event management: collecting and correlating security logs.", "Security information and event management", 0.35),
    c("sandboxing", "Sandboxing", SEC, "Running untrusted code with tightly restricted access.", "Sandbox (computer security)", 0.4),
    # ---------------- Databases ----------------
    c("b-tree", "B-Tree", DB, "The balanced tree behind most database indexes.", "B-tree", 0.5),
    c("lsm-tree", "LSM Tree", DB, "A write-optimised structure that batches writes and merges sorted files.", "Log-structured merge-tree", 0.4, ["Log-Structured Merge Tree"]),
    c("write-ahead-log", "Write-Ahead Log", DB, "Recording changes in a log before applying them, for crash recovery.", "Write-ahead logging", 0.45, ["WAL"]),
    c("mvcc", "MVCC", DB, "Multi-version concurrency control: readers see a snapshot while writers proceed.", "Multiversion concurrency control", 0.45),
    c("query-optimization", "Query Optimization", DB, "Choosing the cheapest plan to execute a query.", "Query optimization", 0.45),
    c("database-normalization", "Database Normalization", DB, "Structuring tables to remove redundancy and update anomalies.", "Database normalization", 0.45),
    c("columnar-storage", "Columnar Storage", DB, "Storing data by column so analytical scans read only what they need.", "Column-oriented DBMS", 0.45),
    c("time-series-database", "Time-Series Database", DB, "Databases optimised for timestamped metrics and events.", "Time series database", 0.4),
    c("graph-database", "Graph Database", DB, "Databases that store nodes and relationships as first-class data.", "Graph database", 0.45),
    c("change-data-capture", "Change Data Capture", DB, "Streaming every row change out of a database as events.", "Change data capture", 0.4, ["CDC"]),
    c("data-mesh", "Data Mesh", DB, "Domain teams owning and publishing their data as products.", "Data mesh", 0.35),
    # ---------------- Cloud ----------------
    c("multi-tenancy", "Multi-Tenancy", OPS, "Serving many customers from one shared system while keeping them isolated.", "Multitenancy", 0.4),
    c("cloud-service-models", "Cloud Service Models", OPS, "IaaS, PaaS and SaaS: how much of the stack the provider runs.", "Cloud computing", 0.45, ["IaaS", "PaaS", "SaaS"]),
    c("finops", "FinOps", OPS, "Managing and optimising cloud spend as an engineering practice.", "FinOps", 0.3),
    c("platform-engineering", "Platform Engineering", OPS, "Building internal developer platforms with paved paths to production.", "Platform engineering", 0.4),
    # ---------------- Robotics ----------------
    c("swarm-robotics", "Swarm Robotics", ROB, "Many simple robots coordinating to achieve collective behaviour.", "Swarm robotics", 0.35),
    c("soft-robotics", "Soft Robotics", ROB, "Robots built from flexible, compliant materials.", "Soft robotics", 0.3),
    c("humanoid-robots", "Humanoid Robots", ROB, "Robots with a human-like body plan for human-built environments.", "Humanoid robot", 0.4),
    c("sim-to-real-transfer", "Sim-to-Real Transfer", ROB, "Training robot policies in simulation and making them work on real hardware.", "Robot learning", 0.35),
    # ---------------- Quantum ----------------
    c("quantum-machine-learning", "Quantum Machine Learning", QC, "Machine learning algorithms that run on, or are inspired by, quantum computers.", "Quantum machine learning", 0.4, ["QML"]),
    c("quantum-teleportation", "Quantum Teleportation", QC, "Transferring a qubit's state using entanglement and classical bits.", "Quantum teleportation", 0.35),
    c("quantum-simulation", "Quantum Simulation", QC, "Using quantum hardware to model molecules and materials.", "Quantum simulator", 0.4),
    c("qaoa", "QAOA", QC, "The quantum approximate optimisation algorithm for combinatorial problems.", "Quantum optimization algorithms", 0.3, ["Quantum Approximate Optimization Algorithm"]),
    # ---------------- Graphics & games ----------------
    c("computer-animation", "Computer Animation", CG, "Generating moving images: keyframes, skeletal rigs and simulation.", "Computer animation", 0.45),
    c("volume-rendering", "Volume Rendering", CG, "Visualising 3D sampled data such as CT scans.", "Volume rendering", 0.35),
    c("neural-radiance-fields", "Neural Radiance Fields", CG, "Neural networks that reconstruct 3D scenes from photos.", "Neural radiance field", 0.4, ["NeRF"]),
    c("gaussian-splatting", "Gaussian Splatting", CG, "Real-time 3D scene rendering with millions of fitted Gaussian blobs.", "Gaussian splatting", 0.35),
    c("procedural-generation", "Procedural Generation", GAME, "Creating game content algorithmically instead of by hand.", "Procedural generation", 0.45),
    # ---------------- Blockchain & IoT ----------------
    c("stablecoin", "Stablecoins", CHAIN, "Cryptocurrencies pegged to a stable asset such as the US dollar.", "Stablecoin", 0.4),
    c("dao", "DAO", CHAIN, "Decentralised autonomous organisation: governed by token holders via smart contracts.", "Decentralized autonomous organization", 0.35, ["Decentralized Autonomous Organization"]),
    c("nft", "NFT", CHAIN, "Non-fungible tokens: unique on-chain records of ownership.", "Non-fungible token", 0.35, ["Non-Fungible Token"]),
    c("predictive-maintenance", "Predictive Maintenance", IOT, "Using sensor data to fix equipment before it fails.", "Predictive maintenance", 0.4),
]

TECHNOLOGIES = [
    t("kicad", "KiCad", "developer_tool", CE, "Open-source suite for schematic capture and PCB layout.", "KiCad", "https://www.kicad.org"),
    t("matlab", "MATLAB", "programming_language", SP, "Numerical computing environment widely used in engineering and signal processing.", "MATLAB", "https://www.mathworks.com/products/matlab.html"),
    t("simulink", "Simulink", "developer_tool", SP, "Block-diagram environment for modelling and simulating dynamic systems.", "Simulink", "https://www.mathworks.com/products/simulink.html"),
    t("gnu-radio", "GNU Radio", "framework", SP, "Open-source toolkit for building software-defined radios.", "GNU Radio", "https://www.gnuradio.org"),
    t("systemverilog", "SystemVerilog", "programming_language", DD, "Hardware description and verification language extending Verilog.", "SystemVerilog"),
    t("chisel", "Chisel", "programming_language", DD, "Hardware construction language embedded in Scala.", "Chisel (programming language)", "https://www.chisel-lang.org"),
    t("yosys", "Yosys", "developer_tool", DD, "Open-source framework for Verilog RTL synthesis.", "Yosys", "https://yosyshq.net/yosys/"),
    t("biopython", "Biopython", "library", BIO, "Python tools for biological computation and sequence analysis.", "Biopython", "https://biopython.org"),
    t("blast", "BLAST", "developer_tool", BIO, "The standard tool for searching sequence databases by similarity.", "BLAST (biotechnology)", "https://blast.ncbi.nlm.nih.gov"),
    t("alphafold", "AlphaFold", "platform", BIO, "DeepMind's AI system that predicts protein structures.", "AlphaFold"),
    t("gromacs", "GROMACS", "developer_tool", BIO, "High-performance molecular dynamics package.", "GROMACS", "https://www.gromacs.org"),
    t("quantlib", "QuantLib", "library", FIN, "Open-source library for quantitative finance and derivatives pricing.", "QuantLib", "https://www.quantlib.org"),
    t("hl7-fhir", "HL7 FHIR", "standard", MED, "Modern API standard for exchanging healthcare data.", "Fast Healthcare Interoperability Resources", "https://hl7.org/fhir/"),
    t("slurm", "Slurm", "developer_tool", SYS, "Workload manager that schedules jobs on most of the world's supercomputers.", "Slurm Workload Manager", "https://slurm.schedmd.com"),
    t("qgis", "QGIS", "developer_tool", IX, "Free and open-source desktop GIS application.", "QGIS", "https://qgis.org"),
    t("tensorflow-lite", "LiteRT (TensorFlow Lite)", "framework", EMB, "Google's runtime for running ML models on phones and microcontrollers.", "TensorFlow", "https://ai.google.dev/edge/litert"),
]


def e(s, r, t_):
    return {"source": s, "target": t_, "relationship_type": r}


def C(slug):
    return f"concept:{slug}"


def T(slug):
    return f"technology:{slug}"


R = "related_to"
EDGES = [
    *(e(n["id"], "belongs_to_domain", n["primary_domain"]) for n in CONCEPTS + TECHNOLOGIES),
    *(e(nid, "belongs_to_domain", dom) for nid, dom in MOVES.items()),
    *(e(parent, "has_subdomain", child) for parent, child in SUBDOMAINS),

    # Architecture
    e(C("cache-coherence"), R, C("cache-hierarchy")), e(C("cache-coherence"), R, C("multiprocessor-architecture")),
    e(C("cache-coherence"), R, C("memory-consistency")),
    e(C("simultaneous-multithreading"), R, C("thread")), e(C("simultaneous-multithreading"), R, C("superscalar")),
    e(C("vliw"), R, C("instruction-level-parallelism")), e(C("vliw"), "alternative_to", C("superscalar")),
    e(C("risc"), R, C("isa")), e(C("cisc"), R, C("isa")), e(C("risc"), "alternative_to", C("cisc")),
    e(T("risc-v"), "implements", C("risc")), e(T("arm"), "implements", C("risc")), e(T("x86-64"), "implements", C("cisc")),
    e(C("microarchitecture"), R, C("isa")), e(C("microarchitecture"), R, C("cpu-pipelining")),
    e(C("instruction-level-parallelism"), R, C("out-of-order-execution")), e(C("instruction-level-parallelism"), R, C("superscalar")),
    e(C("speculative-execution"), R, C("branch-prediction")), e(C("speculative-execution"), R, C("side-channel-attack")),
    e(C("tlb"), R, C("virtual-memory")), e(C("tlb"), R, C("cache-hierarchy")),
    e(C("dram"), R, C("memory-hierarchy")), e(C("numa"), R, C("multiprocessor-architecture")), e(C("numa"), R, C("memory-hierarchy")),
    e(C("vector-processor"), R, C("simd")), e(C("hardware-accelerator"), R, C("gpu-architecture")),
    e(C("hardware-accelerator"), R, C("asic")), e(T("fpga"), "used_for", C("hardware-accelerator")),
    e(C("systolic-array"), R, C("hardware-accelerator")), e(C("systolic-array"), R, C("neural-networks")),
    e(C("neuromorphic-computing"), R, C("neural-networks")), e(C("neuromorphic-computing"), R, C("computational-neuroscience")),
    e(C("chiplet"), R, C("system-on-chip")), e(C("chiplet"), R, C("semiconductor-fabrication")),
    e(C("heterogeneous-computing"), R, C("gpu-programming")), e(C("heterogeneous-computing"), R, C("hardware-accelerator")),
    e(T("cuda"), "supports", C("heterogeneous-computing")),

    # Digital design
    e(C("transistor"), "enables", C("cmos")), e(C("cmos"), "enables", C("vlsi")), e(C("cmos"), R, C("low-power-design")),
    e(C("boolean-algebra"), R, C("digital-logic")), e(C("boolean-algebra"), R, C("combinational-logic")),
    e(C("karnaugh-map"), R, C("boolean-algebra")), e(C("flip-flop"), R, C("sequential-logic")),
    e(C("register-transfer-level"), R, C("hdl")), e(T("verilog"), "supports", C("register-transfer-level")),
    e(T("vhdl"), "supports", C("register-transfer-level")),
    e(C("logic-synthesis"), R, C("register-transfer-level")), e(C("logic-synthesis"), R, C("electronic-design-automation")),
    e(C("high-level-synthesis"), R, C("logic-synthesis")), e(C("high-level-synthesis"), R, C("hardware-software-codesign")),
    e(C("static-timing-analysis"), R, C("place-and-route")), e(C("static-timing-analysis"), R, C("electronic-design-automation")),
    e(C("place-and-route"), R, C("vlsi")), e(C("clock-domain-crossing"), R, C("flip-flop")),
    e(C("clock-domain-crossing"), R, C("synchronization")),
    e(C("design-for-testability"), R, C("hardware-verification")), e(C("design-for-testability"), R, C("jtag")),
    e(C("hardware-verification"), R, C("formal-verification")), e(C("hardware-verification"), R, C("model-checking")),
    e(C("electronic-design-automation"), R, C("vlsi")), e(C("system-on-chip"), R, C("asic")),
    e(C("system-on-chip"), R, C("embedded-systems")), e(C("semiconductor-fabrication"), R, C("transistor")),
    e(C("vlsi"), R, C("asic")), e(C("low-power-design"), R, C("system-on-chip")),
    e(T("systemverilog"), "built_on", T("verilog")), e(T("systemverilog"), "supports", C("hardware-verification")),
    e(T("systemverilog"), "supports", C("register-transfer-level")),
    e(T("chisel"), "built_on", T("scala")), e(T("chisel"), "supports", C("register-transfer-level")),
    e(T("chisel"), "commonly_used_with", T("risc-v")),
    e(T("yosys"), "implements", C("logic-synthesis")), e(T("yosys"), "integrates_with", T("verilog")),
    e(T("kicad"), "used_for", C("printed-circuit-board")), e(T("kicad"), "implements", C("electronic-design-automation")),

    # Signal processing
    e(C("digital-signal-processing"), R, C("fourier-transform")), e(C("digital-signal-processing"), R, C("sampling-theorem")),
    e(C("fast-fourier-transform"), R, C("fourier-transform")),
    e(C("fast-fourier-transform"), R, C("divide-and-conquer")),
    e(C("sampling-theorem"), R, C("analog-to-digital-conversion")), e(C("sampling-theorem"), R, C("information-theory")),
    e(C("z-transform"), R, C("digital-filter")), e(C("digital-filter"), R, C("convolution")),
    e(C("convolution"), R, C("convolutional-neural-network")), e(C("convolution"), R, C("image-processing")),
    e(C("modulation"), R, C("ofdm")), e(C("modulation"), R, C("software-defined-radio")),
    e(C("wavelet-transform"), R, C("fourier-transform")), e(C("wavelet-transform"), R, C("data-compression")),
    e(C("image-processing"), R, C("computer-vision")), e(C("image-processing"), R, C("medical-imaging")),
    e(C("audio-signal-processing"), R, C("speech-recognition")), e(C("audio-signal-processing"), R, C("music-information-retrieval")),
    e(C("ofdm"), R, C("wi-fi")), e(C("ofdm"), R, C("cellular-5g")), e(C("mimo"), R, C("cellular-5g")), e(C("mimo"), R, C("wi-fi")),
    e(C("compressed-sensing"), R, C("sampling-theorem")), e(C("compressed-sensing"), R, C("medical-imaging")),
    e(C("adaptive-filter"), R, C("digital-filter")), e(C("adaptive-filter"), R, C("kalman-filter")),
    e(C("data-compression"), R, C("information-theory")), e(C("data-compression"), R, C("entropy")),
    e(T("matlab"), "supports", C("digital-signal-processing")), e(T("matlab"), "supports", C("numerical-analysis")),
    e(T("matlab"), "alternative_to", T("julia")),
    e(T("simulink"), "part_of_ecosystem", T("matlab")), e(T("simulink"), "supports", C("control-theory")),
    e(T("simulink"), "supports", C("cyber-physical-systems")),
    e(T("gnu-radio"), "implements", C("software-defined-radio")), e(T("gnu-radio"), "supports", C("modulation")),
    e(T("numpy"), "supports", C("fast-fourier-transform")), e(T("opencv"), "supports", C("image-processing")),

    # Embedded
    e(C("pwm"), R, C("microcontroller")), e(C("pwm"), R, C("analog-circuit-design")),
    e(C("gpio"), R, C("microcontroller")), e(C("gpio"), R, C("memory-mapped-io")),
    e(C("direct-memory-access"), R, C("interrupt-handling")), e(C("direct-memory-access"), R, C("device-driver")),
    e(C("watchdog-timer"), R, C("fault-tolerance")), e(C("watchdog-timer"), R, C("firmware")),
    e(C("bootloader"), R, C("firmware")), e(C("bootloader"), R, C("secure-boot")),
    e(C("memory-mapped-io"), R, C("device-driver")),
    e(C("embedded-linux"), R, C("embedded-systems")), e(T("linux"), "used_for", C("embedded-linux")),
    e(T("raspberry-pi"), "supports", C("embedded-linux")), e(T("raspberry-pi"), "supports", C("gpio")),
    e(T("arduino"), "supports", C("pwm")), e(T("arduino"), "supports", C("gpio")), e(T("esp32"), "supports", C("tinyml")),
    e(C("hardware-abstraction-layer"), R, C("device-driver")), e(T("zephyr"), "implements", C("hardware-abstraction-layer")),
    e(C("tinyml"), R, C("model-quantization")), e(C("tinyml"), R, C("microcontroller")),
    e(T("tensorflow-lite"), "implements", C("tinyml")), e(T("tensorflow-lite"), "part_of_ecosystem", T("tensorflow")),
    e(T("tensorflow-lite"), "supports", C("model-quantization")),
    e(C("cyber-physical-systems"), R, C("control-theory")), e(C("cyber-physical-systems"), R, C("digital-twin")),
    e(C("jtag"), R, C("firmware")),

    # Computer engineering
    e(C("hardware-software-codesign"), R, C("embedded-systems")), e(C("hardware-software-codesign"), R, C("system-on-chip")),
    e(C("printed-circuit-board"), R, C("signal-integrity")), e(C("printed-circuit-board"), R, C("embedded-systems")),
    e(C("analog-circuit-design"), R, C("analog-to-digital-conversion")), e(C("analog-circuit-design"), R, C("transistor")),
    e(C("signal-integrity"), R, C("vlsi")),

    # HCI
    e(C("user-centered-design"), R, C("human-computer-interaction")), e(C("user-centered-design"), R, C("user-experience")),
    e(C("user-research"), R, C("user-centered-design")), e(C("user-research"), R, C("usability-testing")),
    e(C("personas"), R, C("user-research")), e(C("cognitive-load"), R, C("mental-model")),
    e(C("cognitive-load"), R, C("interaction-design")), e(C("mental-model"), R, C("information-architecture")),
    e(C("fitts-law"), R, C("interaction-design")), e(C("fitts-law"), R, C("accessibility")),
    e(C("information-architecture"), R, C("user-experience")),
    e(C("ui-prototyping"), R, C("usability-testing")), e(T("figma"), "used_for", C("ui-prototyping")),
    e(C("heuristic-evaluation"), R, C("usability-testing")), e(C("eye-tracking"), R, C("usability-testing")),
    e(C("eye-tracking"), R, C("gesture-recognition")),
    e(C("conversational-ui"), R, C("large-language-models")), e(C("conversational-ui"), R, C("natural-language-processing")),
    e(C("voice-user-interface"), R, C("speech-recognition")), e(C("voice-user-interface"), R, C("conversational-ui")),
    e(C("gesture-recognition"), R, C("computer-vision")), e(C("gesture-recognition"), R, C("virtual-reality")),
    e(C("haptics"), R, C("virtual-reality")), e(C("haptics"), R, C("human-robot-interaction")),
    e(C("brain-computer-interface"), R, C("computational-neuroscience")), e(C("brain-computer-interface"), R, C("digital-signal-processing")),
    e(C("cscw"), R, C("real-time-communication")), e(C("cscw"), R, C("human-computer-interaction")),
    e(C("ubiquitous-computing"), R, C("internet-of-things")), e(C("ubiquitous-computing"), R, C("human-computer-interaction")),
    e(C("affective-computing"), R, C("sentiment-analysis")), e(C("affective-computing"), R, C("human-computer-interaction")),
    e(C("dark-patterns"), R, C("user-experience")), e(C("dark-patterns"), R, C("data-privacy")),
    e(C("human-robot-interaction"), R, C("embodied-ai")), e(C("human-robot-interaction"), R, C("humanoid-robots")),

    # Interdisciplinary
    e(C("computational-social-science"), R, C("graph-theory")), e(C("computational-social-science"), R, C("natural-language-processing")),
    e(C("digital-humanities"), R, C("natural-language-processing")), e(C("digital-humanities"), R, C("data-visualization")),
    e(C("educational-technology"), R, C("recommender-systems")), e(C("educational-technology"), R, C("user-experience")),
    e(C("computational-neuroscience"), R, C("neural-networks")), e(C("computational-neuroscience"), R, C("scientific-computing")),
    e(C("climate-informatics"), R, C("time-series-forecasting")), e(C("climate-informatics"), R, C("high-performance-computing")),
    e(C("geographic-information-systems"), R, C("computational-geometry")), e(C("geographic-information-systems"), R, C("data-visualization")),
    e(T("qgis"), "implements", C("geographic-information-systems")), e(T("postgresql"), "supports", C("geographic-information-systems")),
    e(C("computational-chemistry"), R, C("molecular-dynamics")), e(C("computational-chemistry"), R, C("quantum-simulation")),
    e(C("computational-physics"), R, C("monte-carlo-methods")), e(C("computational-physics"), R, C("numerical-analysis")),
    e(C("computational-physics"), R, C("physics-simulation")),
    e(C("smart-cities"), R, C("internet-of-things")), e(C("smart-cities"), R, C("smart-grid")),
    e(C("precision-agriculture"), R, C("internet-of-things")), e(C("precision-agriculture"), R, C("computer-vision")),
    e(C("computational-law"), R, C("smart-contracts")), e(C("computational-law"), R, C("natural-language-processing")),
    e(C("music-information-retrieval"), R, C("fourier-transform")),
    e(C("computational-linguistics"), R, C("natural-language-processing")), e(C("computational-linguistics"), R, C("formal-languages")),
    e(C("sports-analytics"), R, C("computer-vision")), e(C("sports-analytics"), R, C("data-visualization")),
    e(C("smart-grid"), R, C("cyber-physical-systems")), e(C("smart-grid"), R, C("industrial-iot")),
    e(C("scientific-computing"), R, C("high-performance-computing")),

    # Computational biology
    e(C("genomics"), R, C("bioinformatics")), e(C("genomics"), R, C("next-generation-sequencing")),
    e(C("sequence-alignment"), R, C("dynamic-programming")), e(C("sequence-alignment"), R, C("string-matching")),
    e(C("genome-assembly"), R, C("graph-algorithms")), e(C("genome-assembly"), R, C("next-generation-sequencing")),
    e(C("phylogenetics"), R, C("sequence-alignment")), e(C("phylogenetics"), R, C("bayesian-inference")),
    e(C("protein-structure-prediction"), R, C("deep-learning")), e(C("protein-structure-prediction"), R, C("molecular-dynamics")),
    e(C("gene-expression-analysis"), R, C("unsupervised-learning")), e(C("gene-expression-analysis"), R, C("genomics")),
    e(C("single-cell-analysis"), R, C("dimensionality-reduction")), e(C("single-cell-analysis"), R, C("gene-expression-analysis")),
    e(C("systems-biology"), R, C("biological-network-analysis")), e(C("biological-network-analysis"), R, C("graph-theory")),
    e(C("molecular-dynamics"), R, C("high-performance-computing")), e(C("molecular-dynamics"), R, C("physics-simulation")),
    e(C("computational-drug-discovery"), R, C("protein-structure-prediction")), e(C("computational-drug-discovery"), R, C("graph-neural-networks")),
    e(C("bioinformatics"), R, C("sequence-alignment")),
    e(T("biopython"), "written_in", T("python")), e(T("biopython"), "supports", C("sequence-alignment")),
    e(T("biopython"), "used_for", C("bioinformatics")),
    e(T("blast"), "implements", C("sequence-alignment")), e(T("blast"), "used_for", C("genomics")),
    e(T("alphafold"), "implements", C("protein-structure-prediction")), e(T("alphafold"), "used_for", C("computational-drug-discovery")),
    e(T("gromacs"), "implements", C("molecular-dynamics")), e(T("gromacs"), "supports", C("high-performance-computing")),

    # FinTech
    e(C("algorithmic-trading"), R, C("quantitative-finance")), e(C("algorithmic-trading"), R, C("time-series-forecasting")),
    e(C("high-frequency-trading"), R, C("algorithmic-trading")), e(C("high-frequency-trading"), R, C("order-matching-engine")),
    e(C("high-frequency-trading"), R, C("hardware-accelerator")),
    e(C("quantitative-finance"), R, C("monte-carlo-methods")), e(C("quantitative-finance"), R, C("probability-theory")),
    e(C("risk-modeling"), R, C("quantitative-finance")), e(C("risk-modeling"), R, C("monte-carlo-methods")),
    e(C("payment-systems"), R, C("idempotency")), e(C("payment-systems"), R, C("distributed-transaction")),
    e(T("stripe"), "used_for", C("payment-systems")),
    e(C("open-banking"), R, C("oauth2")), e(C("open-banking"), R, C("rest-api")),
    e(C("fraud-detection"), R, C("anomaly-detection")), e(C("fraud-detection"), R, C("payment-systems")),
    e(C("credit-scoring"), R, C("gradient-boosting")), e(C("credit-scoring"), R, C("explainable-ai")),
    e(C("robo-advisor"), R, C("quantitative-finance")), e(C("regtech"), R, C("risk-modeling")), e(C("regtech"), R, C("gdpr")),
    e(C("order-matching-engine"), R, C("message-queue")),
    e(C("cbdc"), R, C("distributed-ledger")), e(C("cbdc"), R, C("payment-systems")),
    e(T("quantlib"), "written_in", T("cpp")), e(T("quantlib"), "supports", C("quantitative-finance")),
    e(T("quantlib"), "supports", C("risk-modeling")),

    # Health
    e(C("electronic-health-records"), R, C("health-data-interoperability")), e(C("electronic-health-records"), R, C("hipaa")),
    e(C("health-data-interoperability"), R, C("rest-api")),
    e(T("hl7-fhir"), "implements", C("health-data-interoperability")), e(T("hl7-fhir"), "supports", C("electronic-health-records")),
    e(T("hl7-fhir"), "related_to", C("rest-api")),
    e(C("medical-imaging"), R, C("image-segmentation")), e(C("medical-imaging"), R, C("convolutional-neural-network")),
    e(C("clinical-decision-support"), R, C("explainable-ai")), e(C("clinical-decision-support"), R, C("electronic-health-records")),
    e(C("telemedicine"), R, C("real-time-communication")), e(C("telemedicine"), R, C("hipaa")),
    e(C("wearable-health-monitoring"), R, C("internet-of-things")), e(C("wearable-health-monitoring"), R, C("digital-signal-processing")),
    e(C("precision-medicine"), R, C("genomics")), e(C("precision-medicine"), R, C("clinical-decision-support")),
    e(C("hipaa"), R, C("data-privacy")), e(C("hipaa"), R, C("gdpr")),
    e(C("epidemiological-modeling"), R, C("computational-social-science")), e(C("epidemiological-modeling"), R, C("monte-carlo-methods")),
    e(C("medical-device-software"), R, C("embedded-systems")), e(C("medical-device-software"), R, C("formal-verification")),

    # AI
    e(C("hidden-markov-model"), R, C("probabilistic-graphical-models")), e(C("hidden-markov-model"), R, C("speech-recognition")),
    e(C("hidden-markov-model"), R, C("markov-decision-process")),
    e(C("generative-adversarial-network"), R, C("deep-learning")), e(C("generative-adversarial-network"), "alternative_to", C("diffusion-models")),
    e(C("variational-autoencoder"), R, C("representation-learning")), e(C("variational-autoencoder"), R, C("diffusion-models")),
    e(C("recurrent-neural-network"), R, C("neural-networks")), e(C("recurrent-neural-network"), "alternative_to", C("transformers")),
    e(C("lstm"), R, C("recurrent-neural-network")),
    e(C("transfer-learning"), R, C("fine-tuning")), e(C("transfer-learning"), R, C("representation-learning")),
    e(C("federated-learning"), R, C("data-privacy")), e(C("federated-learning"), R, C("differential-privacy")),
    e(C("explainable-ai"), R, C("ai-alignment")), e(C("ai-alignment"), R, C("rlhf")), e(C("ai-alignment"), R, C("large-language-models")),
    e(C("rlhf"), R, C("reinforcement-learning")), e(C("rlhf"), R, C("fine-tuning")),
    e(C("knowledge-graph"), R, C("graph-database")), e(C("knowledge-graph"), R, C("retrieval-augmented-generation")),
    e(T("neo4j"), "supports", C("knowledge-graph")),
    e(C("object-detection"), R, C("computer-vision")), e(C("object-detection"), R, C("convolutional-neural-network")),
    e(C("image-segmentation"), R, C("computer-vision")), e(T("opencv"), "supports", C("object-detection")),
    e(C("speech-recognition"), R, C("natural-language-processing")), e(C("speech-recognition"), R, C("transformers")),
    e(C("machine-translation"), R, C("transformers")), e(C("machine-translation"), R, C("natural-language-processing")),
    e(C("sentiment-analysis"), R, C("natural-language-processing")), e(C("named-entity-recognition"), R, C("natural-language-processing")),
    e(T("spacy"), "supports", C("named-entity-recognition")), e(T("huggingface-transformers"), "supports", C("machine-translation")),
    e(C("mixture-of-experts"), R, C("transformers")), e(C("mixture-of-experts"), R, C("large-language-models")),
    e(C("model-quantization"), R, C("model-inference")), e(T("ollama"), "supports", C("model-quantization")),
    e(C("knowledge-distillation"), R, C("model-inference")), e(C("knowledge-distillation"), R, C("transfer-learning")),
    e(C("anomaly-detection"), R, C("unsupervised-learning")), e(C("anomaly-detection"), R, C("intrusion-detection")),
    e(C("time-series-forecasting"), R, C("recurrent-neural-network")), e(C("time-series-forecasting"), R, C("time-series-database")),
    e(C("causal-inference"), R, C("bayesian-inference")), e(C("causal-inference"), R, C("ab-testing")),
    e(C("contrastive-learning"), R, C("self-supervised-learning")), e(C("contrastive-learning"), R, C("vector-embeddings")),
    e(C("gradient-boosting"), R, C("decision-trees")), e(T("xgboost"), "implements", C("gradient-boosting")),
    e(C("decision-trees"), R, C("supervised-learning")), e(T("scikit-learn"), "supports", C("decision-trees")),
    e(C("support-vector-machine"), R, C("supervised-learning")), e(T("scikit-learn"), "supports", C("support-vector-machine")),
    e(C("k-means-clustering"), R, C("unsupervised-learning")), e(T("scikit-learn"), "supports", C("k-means-clustering")),
    e(C("dimensionality-reduction"), R, C("linear-algebra")), e(C("dimensionality-reduction"), R, C("unsupervised-learning")),
    e(T("scikit-learn"), "supports", C("dimensionality-reduction")),

    # Theory
    e(C("lambda-calculus"), R, C("functional-programming")), e(C("lambda-calculus"), R, C("type-theory")),
    e(C("lambda-calculus"), R, C("turing-machine")),
    e(C("graph-theory"), R, C("graph-algorithms")), e(C("graph-theory"), R, C("discrete-mathematics")),
    e(C("discrete-mathematics"), R, C("algorithms")), e(C("linear-algebra"), R, C("neural-networks")),
    e(C("linear-algebra"), R, C("numerical-analysis")), e(C("linear-algebra"), R, C("quantum-gate")),
    e(C("probability-theory"), R, C("bayesian-inference")), e(C("probability-theory"), R, C("randomized-algorithms")),
    e(C("game-theory"), R, C("multi-agent-systems")), e(C("game-theory"), R, C("consensus")),
    e(C("monte-carlo-methods"), R, C("randomized-algorithms")), e(C("monte-carlo-methods"), R, C("probability-theory")),
    e(C("linear-programming"), R, C("convex-optimization")), e(C("linear-programming"), R, C("approximation-algorithms")),
    e(C("convex-optimization"), R, C("gradient-descent")),
    e(C("kolmogorov-complexity"), R, C("information-theory")), e(C("kolmogorov-complexity"), R, C("computability-theory")),
    e(C("amortized-analysis"), R, C("asymptotic-analysis")), e(C("amortized-analysis"), R, C("data-structures")),
    e(C("string-matching"), R, C("algorithms")), e(C("string-matching"), R, C("full-text-search")),
    e(C("network-flow"), R, C("graph-algorithms")), e(C("network-flow"), R, C("linear-programming")),
    e(C("bloom-filter"), R, C("hashing")), e(C("bloom-filter"), R, C("lsm-tree")),

    # Software engineering & languages
    e(C("type-inference"), R, C("type-theory")), e(T("typescript"), "supports", C("type-inference")),
    e(T("haskell"), "supports", C("type-inference")), e(T("ocaml"), "supports", C("type-inference")),
    e(C("generics"), R, C("type-theory")), e(T("java"), "supports", C("generics")), e(T("rust"), "supports", C("generics")),
    e(C("memory-safety"), R, C("buffer-overflow")), e(C("memory-safety"), R, C("garbage-collection")),
    e(T("rust"), "supports", C("memory-safety")),
    e(C("ownership-and-borrowing"), R, C("memory-safety")), e(T("rust"), "implements", C("ownership-and-borrowing")),
    e(C("metaprogramming"), R, C("compilation")), e(T("clojure"), "supports", C("metaprogramming")),
    e(C("coroutines"), R, C("asynchronous-programming")), e(C("coroutines"), R, C("concurrency")),
    e(T("kotlin"), "supports", C("coroutines")),
    e(C("actor-model"), R, C("message-passing")), e(C("actor-model"), R, C("concurrency")),
    e(T("erlang"), "implements", C("actor-model")), e(T("elixir"), "implements", C("actor-model")),
    e(C("design-by-contract"), R, C("hoare-logic")), e(C("design-by-contract"), R, C("formal-verification")),
    e(C("software-architecture"), R, C("design-patterns")), e(C("software-architecture"), R, C("microservices")),
    e(C("software-architecture"), R, C("domain-driven-design")),
    e(C("requirements-engineering"), R, C("agile")), e(C("requirements-engineering"), R, C("software-architecture")),
    e(C("just-in-time-compilation"), R, C("compilation")), e(C("just-in-time-compilation"), R, C("interpreter")),
    e(T("nodejs"), "implements", C("just-in-time-compilation")), e(T("julia"), "implements", C("just-in-time-compilation")),
    e(C("interpreter"), R, C("parsing")), e(T("python"), "implements", C("interpreter")),

    # Systems & HPC
    e(C("amdahls-law"), R, C("parallel-computing")), e(C("amdahls-law"), R, C("parallel-algorithms")),
    e(C("supercomputer"), R, C("high-performance-computing")), e(C("supercomputer"), R, C("cluster-computing")),
    e(T("slurm"), "used_for", C("supercomputer")), e(T("slurm"), "supports", C("cluster-computing")),
    e(T("slurm"), "commonly_used_with", T("mpi")),
    e(C("exascale-computing"), R, C("supercomputer")), e(C("exascale-computing"), R, C("heterogeneous-computing")),
    e(C("distributed-shared-memory"), R, C("distributed-systems")), e(C("distributed-shared-memory"), R, C("memory-consistency")),
    e(C("lock-free-data-structures"), R, C("synchronization")), e(C("lock-free-data-structures"), R, C("concurrency")),
    e(C("copy-on-write"), R, C("virtual-memory")), e(C("copy-on-write"), R, C("immutability")),
    e(C("page-replacement"), R, C("virtual-memory")), e(C("page-replacement"), R, C("caching")),

    # Networks
    e(C("osi-model"), R, C("tcp-ip")), e(C("osi-model"), R, C("packet-switching")),
    e(C("subnetting"), R, C("ipv4")), e(C("subnetting"), R, C("routing")),
    e(C("vlan"), R, C("switching")), e(C("vlan"), R, C("sdn")),
    e(C("vpn"), R, C("tls")), e(C("vpn"), R, C("zero-trust")),
    e(C("dhcp"), R, C("ipv4")), e(C("dhcp"), R, C("dns")), e(C("arp"), R, C("ipv4")), e(C("arp"), R, C("switching")),
    e(C("peer-to-peer-networking"), R, C("distributed-systems")), e(C("peer-to-peer-networking"), R, C("blockchain")),
    e(T("ipfs"), "implements", C("peer-to-peer-networking")), e(T("webrtc"), "supports", C("peer-to-peer-networking")),
    e(C("multicast"), R, C("routing")), e(C("multicast"), R, C("real-time-communication")),
    e(C("network-function-virtualization"), R, C("sdn")), e(C("network-function-virtualization"), R, C("virtualization")),
    e(C("mesh-networking"), R, C("zigbee")), e(C("mesh-networking"), R, C("routing")),
    e(C("vehicle-to-everything"), R, C("cellular-5g")), e(C("vehicle-to-everything"), R, C("autonomous-navigation")),

    # Security
    e(C("side-channel-attack"), R, C("cryptography")), e(C("side-channel-attack"), R, C("cache-hierarchy")),
    e(C("trusted-execution-environment"), R, C("zero-trust")), e(C("trusted-execution-environment"), R, C("homomorphic-encryption")),
    e(C("secure-boot"), R, C("digital-signature")), e(C("secure-boot"), R, C("firmware")),
    e(C("hardware-security-module"), R, C("secrets-management")), e(C("hardware-security-module"), R, C("public-key-cryptography")),
    e(C("fuzzing"), R, C("penetration-testing")), e(C("fuzzing"), R, C("symbolic-execution")),
    e(C("malware-analysis"), R, C("reverse-engineering")), e(C("malware-analysis"), R, C("sandboxing")),
    e(C("reverse-engineering"), R, C("compilation")),
    e(C("intrusion-detection"), R, C("observability")), e(T("snort"), "implements", C("intrusion-detection")),
    e(T("falco"), "implements", C("intrusion-detection")),
    e(C("buffer-overflow"), R, C("memory-management")), e(C("buffer-overflow"), R, C("penetration-testing")),
    e(C("csrf"), R, C("xss")), e(C("csrf"), R, C("session-management")),
    e(C("ddos-attack"), R, C("rate-limiting")), e(C("ddos-attack"), R, C("content-delivery-network")),
    e(T("cloudflare"), "supports", C("ddos-attack")),
    e(C("phishing"), R, C("mfa")), e(C("phishing"), R, C("authentication")),
    e(C("supply-chain-security"), R, C("package-management")), e(C("supply-chain-security"), R, C("ci-cd")),
    e(T("trivy"), "supports", C("supply-chain-security")),
    e(C("siem"), R, C("observability")), e(C("siem"), R, C("incident-management")),
    e(C("sandboxing"), R, C("virtualization")), e(C("sandboxing"), R, C("containerization")),
    e(T("webassembly"), "supports", C("sandboxing")),

    # Databases
    e(C("b-tree"), R, C("database-indexing")), e(C("b-tree"), R, C("data-structures")),
    e(T("postgresql"), "implements", C("b-tree")), e(T("sqlite"), "implements", C("b-tree")),
    e(C("lsm-tree"), "alternative_to", C("b-tree")), e(T("cassandra"), "implements", C("lsm-tree")),
    e(C("write-ahead-log"), R, C("database-transaction")), e(C("write-ahead-log"), R, C("replication")),
    e(T("postgresql"), "implements", C("write-ahead-log")),
    e(C("mvcc"), R, C("database-transaction")), e(C("mvcc"), R, C("acid")), e(T("postgresql"), "implements", C("mvcc")),
    e(C("query-optimization"), R, C("sql")), e(C("query-optimization"), R, C("database-indexing")),
    e(C("database-normalization"), R, C("relational-databases")), e(C("database-normalization"), R, C("sql")),
    e(C("columnar-storage"), R, C("olap")), e(C("columnar-storage"), R, C("data-warehouse")),
    e(T("clickhouse"), "implements", C("columnar-storage")), e(T("apache-parquet"), "implements", C("columnar-storage")),
    e(T("duckdb"), "implements", C("columnar-storage")),
    e(C("time-series-database"), R, C("nosql")), e(T("influxdb"), "implements", C("time-series-database")),
    e(C("graph-database"), R, C("nosql")), e(C("graph-database"), R, C("graph-theory")),
    e(T("neo4j"), "implements", C("graph-database")),
    e(C("change-data-capture"), R, C("stream-processing")), e(C("change-data-capture"), R, C("event-driven-architecture")),
    e(T("kafka"), "supports", C("change-data-capture")),
    e(C("data-mesh"), R, C("data-lake")), e(C("data-mesh"), R, C("domain-driven-design")),

    # Cloud
    e(C("multi-tenancy"), R, C("cloud-computing")), e(C("multi-tenancy"), R, C("authorization")),
    e(C("cloud-service-models"), R, C("cloud-computing")), e(C("cloud-service-models"), R, C("serverless")),
    e(C("finops"), R, C("cloud-computing")), e(C("finops"), R, C("auto-scaling")),
    e(C("platform-engineering"), R, C("infrastructure-as-code")), e(C("platform-engineering"), R, C("gitops")),

    # Robotics
    e(C("swarm-robotics"), R, C("multi-agent-systems")), e(C("swarm-robotics"), R, C("consensus")),
    e(C("soft-robotics"), R, C("robot-dynamics")), e(C("soft-robotics"), R, C("control-theory")),
    e(C("humanoid-robots"), R, C("embodied-ai")), e(C("humanoid-robots"), R, C("inverse-kinematics")),
    e(C("sim-to-real-transfer"), R, C("physics-simulation")), e(C("sim-to-real-transfer"), R, C("deep-rl")),
    e(T("gazebo"), "supports", C("sim-to-real-transfer")),

    # Quantum
    e(C("quantum-machine-learning"), R, C("quantum-algorithms")), e(C("quantum-machine-learning"), R, C("neural-networks")),
    e(C("quantum-machine-learning"), R, C("variational-quantum-eigensolver")), e(T("pennylane"), "supports", C("quantum-machine-learning")),
    e(C("quantum-teleportation"), R, C("quantum-entanglement")), e(C("quantum-teleportation"), R, C("quantum-key-distribution")),
    e(C("quantum-simulation"), R, C("quantum-algorithms")), e(C("quantum-simulation"), R, C("variational-quantum-eigensolver")),
    e(C("qaoa"), R, C("quantum-algorithms")), e(C("qaoa"), R, C("quantum-annealing")),
    e(T("qiskit"), "supports", C("qaoa")),

    # Graphics & games
    e(C("computer-animation"), R, C("forward-kinematics")), e(C("computer-animation"), R, C("physics-simulation")),
    e(T("blender"), "supports", C("computer-animation")),
    e(C("volume-rendering"), R, C("ray-tracing")), e(C("volume-rendering"), R, C("scientific-visualization")),
    e(C("volume-rendering"), R, C("medical-imaging")),
    e(C("neural-radiance-fields"), R, C("deep-learning")), e(C("neural-radiance-fields"), R, C("volume-rendering")),
    e(C("gaussian-splatting"), "alternative_to", C("neural-radiance-fields")), e(C("gaussian-splatting"), R, C("rasterization")),
    e(C("procedural-generation"), R, C("game-engines")), e(C("procedural-generation"), R, C("randomized-algorithms")),

    # Blockchain & IoT
    e(C("stablecoin"), R, C("cryptocurrency")), e(C("stablecoin"), R, C("decentralized-finance")),
    e(C("dao"), R, C("smart-contracts")), e(C("dao"), R, C("decentralized-finance")),
    e(C("nft"), R, C("smart-contracts")), e(T("ethereum"), "supports", C("nft")),
    e(C("predictive-maintenance"), R, C("industrial-iot")), e(C("predictive-maintenance"), R, C("anomaly-detection")),
    e(C("predictive-maintenance"), R, C("digital-twin")),
]


def _rewrite(name: str, fn) -> None:
    path = SEED / name
    data = fn(json.loads(path.read_text(encoding="utf-8")))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def restructure() -> None:
    """Add the new domains, re-parent Architecture/Embedded, and move existing nodes."""
    def add_domains(domains: list[dict]) -> list[dict]:
        have = {d["id"] for d in domains}
        return domains + [d for d in NEW_DOMAINS if d["id"] not in have]

    old_home: dict[str, str] = {}

    def move(nodes: list[dict]) -> list[dict]:
        for n in nodes:
            if n["id"] in MOVES and n["primary_domain"] != MOVES[n["id"]]:
                old_home[n["id"]] = n["primary_domain"]
                n["primary_domain"] = MOVES[n["id"]]
        return nodes

    def fix_edges(edges: list[dict]) -> list[dict]:
        out = []
        for x in edges:
            r = x["relationship_type"]
            if r == "has_subdomain" and REPARENT.get(x["target"], (None,))[0] == x["source"]:
                continue  # old Systems -> Architecture/Embedded links
            if r == "belongs_to_domain" and old_home.get(x["source"]) == x["target"]:
                continue  # old home of a moved node
            out.append(x)
        return out

    _rewrite("domains.json", add_domains)
    _rewrite("concepts.json", move)
    _rewrite("technologies.json", move)
    _rewrite("edges.json", fix_edges)


if __name__ == "__main__":
    restructure()
    apply_batch("big_expansion", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
