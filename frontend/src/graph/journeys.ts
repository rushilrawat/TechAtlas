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
];
