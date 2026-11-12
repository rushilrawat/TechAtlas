export interface JourneyStep { id: string; caption: string }
export interface Journey { title: string; steps: JourneyStep[] }

// Every consecutive pair has a canonical edge in data/graph.json.
export const JOURNEYS: Journey[] = [
  { title: "How a web request works", steps: [
    { id: "concept:dns", caption: "DNS translates a name into a destination." },
    { id: "domain:networks", caption: "The network carries the request to a server." },
    { id: "concept:http", caption: "HTTP defines the request and response." },
    { id: "concept:rest-api", caption: "A REST API exposes resources over HTTP." },
    { id: "technology:fastapi", caption: "A server framework implements the API." },
  ] },
  { title: "From Python to model serving", steps: [
    { id: "technology:python", caption: "Start with Python's data and model ecosystem." },
    { id: "technology:pytorch", caption: "Train and run neural networks with PyTorch." },
    { id: "technology:vllm", caption: "Serve language models efficiently with vLLM." },
    { id: "concept:model-inference", caption: "Inference turns a trained model into predictions." },
  ] },
  { title: "Ship a modern web app", steps: [
    { id: "technology:javascript", caption: "JavaScript runs everywhere a browser does." },
    { id: "technology:typescript", caption: "TypeScript adds types that catch mistakes before users do." },
    { id: "technology:react", caption: "React builds the interface from reusable components." },
    { id: "technology:nextjs", caption: "Next.js adds routing and server-side rendering on top of React." },
    { id: "technology:vercel", caption: "Vercel deploys and hosts the finished app." },
  ] },
  { title: "From commit to production", steps: [
    { id: "technology:git", caption: "Every change starts as a commit in version control." },
    { id: "technology:github-actions", caption: "GitHub Actions runs builds and tests on each push." },
    { id: "concept:ci-cd", caption: "CI/CD turns passing builds into releases automatically." },
    { id: "concept:gitops", caption: "GitOps treats the repository as the source of truth for deploys." },
    { id: "technology:argocd", caption: "Argo CD syncs the cluster with what the repository declares." },
    { id: "technology:kubernetes", caption: "Kubernetes runs and scales the deployed containers." },
  ] },
  { title: "LLM apps with retrieval", steps: [
    { id: "concept:large-language-models", caption: "Large language models generate text from a prompt." },
    { id: "concept:retrieval-augmented-generation", caption: "RAG grounds answers in documents fetched at query time." },
    { id: "concept:vector-embeddings", caption: "Embeddings turn text into vectors that can be compared." },
    { id: "concept:vector-databases", caption: "Vector databases search those embeddings by similarity." },
    { id: "technology:pgvector", caption: "pgvector brings vector search into PostgreSQL." },
    { id: "technology:postgresql", caption: "PostgreSQL stores the data alongside its embeddings." },
  ] },
  { title: "Streaming data pipelines", steps: [
    { id: "technology:kafka", caption: "Kafka carries a continuous stream of events." },
    { id: "concept:stream-processing", caption: "Stream processing transforms events as they arrive." },
    { id: "technology:spark", caption: "Spark processes large datasets in batches or streams." },
    { id: "technology:airflow", caption: "Airflow schedules and orchestrates the pipeline's jobs." },
    { id: "concept:data-pipeline", caption: "Together they form a data pipeline from source to warehouse." },
  ] },
  { title: "Securing logins", steps: [
    { id: "concept:authentication", caption: "Authentication proves who a user is." },
    { id: "concept:mfa", caption: "Multi-factor authentication adds a second proof beyond a password." },
    { id: "technology:keycloak", caption: "Keycloak is an open-source identity server that handles both." },
    { id: "concept:oauth2", caption: "OAuth 2.0 lets apps act for a user without seeing their password." },
  ] },
  { title: "How HTTPS stays private", steps: [
    { id: "concept:cryptography", caption: "Cryptography protects data from being read or altered." },
    { id: "concept:public-key-cryptography", caption: "Public-key cryptography lets strangers agree on secrets." },
    { id: "concept:tls", caption: "TLS uses it to encrypt every HTTPS connection." },
    { id: "technology:let-s-encrypt", caption: "Let's Encrypt issues the free certificates TLS relies on." },
  ] },
  { title: "Infrastructure as code", steps: [
    { id: "technology:aws", caption: "Cloud providers like AWS rent compute, storage and networking." },
    { id: "technology:terraform", caption: "Terraform describes that infrastructure in versioned files." },
    { id: "concept:infrastructure-as-code", caption: "Infrastructure as code makes environments reproducible." },
    { id: "technology:ansible", caption: "Ansible configures the machines once they exist." },
  ] },
  { title: "Building games", steps: [
    { id: "technology:cpp", caption: "C++ powers most performance-critical game code." },
    { id: "technology:unity", caption: "Unity is a widely used engine for 2D, 3D and mobile games." },
    { id: "concept:game-engines", caption: "Game engines bundle rendering, physics, audio and input." },
    { id: "technology:godot", caption: "Godot is a lightweight open-source alternative." },
  ] },
  { title: "How robots find their way", steps: [
    { id: "concept:robot-localization", caption: "Localization estimates where the robot is." },
    { id: "concept:slam", caption: "SLAM builds a map while localizing within it." },
    { id: "concept:occupancy-grid", caption: "An occupancy grid records which cells are free or blocked." },
  ] },
  { title: "How a quantum computer computes", steps: [
    { id: "concept:qubit", caption: "A qubit can hold a blend of 0 and 1 at the same time." },
    { id: "concept:quantum-computing", caption: "Quantum computers manipulate many qubits together." },
    { id: "concept:quantum-gate", caption: "Quantum gates are the operations applied to qubits." },
    { id: "concept:quantum-circuit", caption: "Gates in sequence form a quantum circuit, the program." },
    { id: "technology:qiskit", caption: "Qiskit lets you write circuits in Python." },
    { id: "technology:ibm-quantum-platform", caption: "IBM Quantum runs them on real superconducting hardware." },
  ] },
  { title: "Why quantum threatens encryption", steps: [
    { id: "concept:quantum-algorithms", caption: "Some algorithms only run efficiently on quantum hardware." },
    { id: "concept:shors-algorithm", caption: "Shor's algorithm factors large numbers in polynomial time." },
    { id: "concept:public-key-cryptography", caption: "That breaks the public-key schemes behind RSA." },
    { id: "concept:cryptography", caption: "Cryptographers are preparing replacements now." },
    { id: "concept:post-quantum-cryptography", caption: "Post-quantum cryptography resists attacks by quantum computers." },
  ] },
];
