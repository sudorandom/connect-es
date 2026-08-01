// Copyright 2021-2026 The Connect Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createClient } from "@connectrpc/connect";
import {
  createConnectTransport,
  createConnectWebTransportTransport,
  createConnectWebSocketTransport,
  createCompositeTransport,
} from "@connectrpc/connect-web";
import { ElizaService } from "./gen/eliza_pb.js";

const messagesList = document.querySelector<HTMLElement>("#messages")!;
const inputContainer = document.querySelector<HTMLElement>("#input-container")!;
const tabBtnUnary = document.querySelector<HTMLElement>("#tab-btn-unary")!;
const tabBtnChat = document.querySelector<HTMLElement>("#tab-btn-chat")!;
const tabBtnStreams = document.querySelector<HTMLElement>("#tab-btn-streams")!;
const viewUnary = document.querySelector<HTMLElement>("#view-unary")!;
const viewChat = document.querySelector<HTMLElement>("#view-chat")!;
const viewStreams = document.querySelector<HTMLElement>("#view-streams")!;
const lanesContainer = document.querySelector<HTMLElement>("#lanes-container")!;
const toggleStreamsBtn = document.querySelector<HTMLButtonElement>("#toggle-streams-btn")!;
const laneTransportDescription = document.querySelector<HTMLElement>(
  "#lane-transport-description"
)!;

const controlsChat = document.querySelector<HTMLElement>("#controls-chat")!;
const controlsStreams = document.querySelector<HTMLElement>("#controls-streams")!;

const transportSelectChat = document.createElement("select");
transportSelectChat.innerHTML = `
  <option value="webtransport">WebTransport (HTTP/3 Session)</option>
  <option value="websocket">WebSocket (Connection per RPC)</option>
`;
if (controlsChat) controlsChat.append(transportSelectChat);

const transportSelectStreams = document.createElement("select");
transportSelectStreams.innerHTML = `
  <option value="webtransport">WebTransport (HTTP/3 Session)</option>
  <option value="websocket">WebSocket (Connection per RPC)</option>
`;
if (controlsStreams) controlsStreams.append(transportSelectStreams);

let transport: any = null;

function setupTransport(choice: string = "webtransport") {
  if (choice === "webtransport") {
    if (laneTransportDescription) {
      laneTransportDescription.innerText =
        "Each lane below opens an independent bidirectional QUIC stream multiplexed within one WebTransport session over HTTP/3.";
    }
    console.log("Using WebTransport via CompositeTransport!");
    const session = new WebTransport("https://localhost:4433/webtransport");
    transport = createCompositeTransport(
      createConnectTransport({ baseUrl: "https://localhost:4433" }),
      createConnectWebTransportTransport({
        baseUrl: "https://localhost:4433",
        session,
      })
    );
  } else {
    if (laneTransportDescription) {
      laneTransportDescription.innerText =
        "Each lane below opens an independent WebSocket connection.";
    }
    console.log("Using WebSocket with a dedicated connection per RPC!");
    transport = createCompositeTransport(
      createConnectTransport({ baseUrl: "https://localhost:4433" }),
      createConnectWebSocketTransport({
        baseUrl: "https://localhost:4433",
      })
    );
  }
}
setupTransport(transportSelectChat.value);

const dynamicTransport = {
  unary: (...args: any[]) => transport.unary(...args),
  stream: (...args: any[]) => transport.stream(...args),
};

const client = createClient(ElizaService, dynamicTransport as any);

// Tab Navigation Logic
tabBtnUnary.onclick = () => {
  tabBtnUnary.classList.add("active");
  tabBtnChat.classList.remove("active");
  tabBtnStreams.classList.remove("active");
  viewUnary.classList.add("active");
  viewChat.classList.remove("active");
  viewStreams.classList.remove("active");
};

tabBtnChat.onclick = () => {
  tabBtnChat.classList.add("active");
  tabBtnUnary.classList.remove("active");
  tabBtnStreams.classList.remove("active");
  viewChat.classList.add("active");
  viewUnary.classList.remove("active");
  viewStreams.classList.remove("active");
};

tabBtnStreams.onclick = () => {
  tabBtnStreams.classList.add("active");
  tabBtnUnary.classList.remove("active");
  tabBtnChat.classList.remove("active");
  viewStreams.classList.add("active");
  viewUnary.classList.remove("active");
  viewChat.classList.remove("active");
  renderStreamLanes();
};

// --- View 1: Unary Chat (`Say`) ---
const unaryInput = document.querySelector<HTMLInputElement>("#unary-input")!;
const unaryMessages = document.querySelector<HTMLElement>("#unary-messages")!;

void (async () => {
  const initDiv = document.createElement("div");
  initDiv.className = "msg-bubble msg-eliza";
  initDiv.innerText = "What is your name?";
  unaryMessages.append(initDiv);
})();

let unaryNameSet = false;

unaryInput.onkeyup = async (ev) => {
  if (ev.key === "Enter" && unaryInput.value.trim().length > 0) {
    const text = unaryInput.value.trim();
    unaryInput.value = "";

    const userDiv = document.createElement("div");
    userDiv.className = "msg-bubble msg-user";
    userDiv.innerText = text;
    unaryMessages.append(userDiv);
    unaryMessages.scrollTop = unaryMessages.scrollHeight;

    if (!unaryNameSet) {
      unaryNameSet = true;
      try {
        const res = await client.say({ sentence: text });
        const elizaDiv = document.createElement("div");
        elizaDiv.className = "msg-bubble msg-eliza";
        elizaDiv.innerText = `Hi ${text}! ${res.sentence}`;
        unaryMessages.append(elizaDiv);
        unaryMessages.scrollTop = unaryMessages.scrollHeight;
      } catch (e) {
        const sysDiv = document.createElement("div");
        sysDiv.className = "msg-bubble msg-system";
        sysDiv.innerText = "Say error: " + String(e);
        unaryMessages.append(sysDiv);
        unaryMessages.scrollTop = unaryMessages.scrollHeight;
      }
      return;
    }

    try {
      const res = await client.say({ sentence: text });
      const elizaDiv = document.createElement("div");
      elizaDiv.className = "msg-bubble msg-eliza";
      elizaDiv.innerText = res.sentence;
      unaryMessages.append(elizaDiv);
      unaryMessages.scrollTop = unaryMessages.scrollHeight;
    } catch (e) {
      const sysDiv = document.createElement("div");
      sysDiv.className = "msg-bubble msg-system";
      sysDiv.innerText = "Say error: " + String(e);
      unaryMessages.append(sysDiv);
      unaryMessages.scrollTop = unaryMessages.scrollHeight;
    }
  }
};

// --- View 1: Eliza Chat ---
void (async () => {
  let activeAbortController = new AbortController();

  async function startChat() {
    activeAbortController.abort();
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    async function* generateRequests() {
      for (;;) {
        try {
          const sentence = await prompt(signal);
          print(`> ${sentence}`);
          yield { sentence };
        } catch (e) {
          if (signal.aborted) break;
          throw e;
        }
      }
    }

    try {
      for await (const res of client.converse(generateRequests(), { signal })) {
        print(res.sentence);
      }
    } catch (e) {
      if (!signal.aborted) {
        print("Converse error: " + String(e));
      }
    }
  }

  transportSelectChat.onchange = async () => {
    transportSelectStreams.value = transportSelectChat.value;
    setupTransport(transportSelectChat.value);
    print("[System] Switched transport to " + transportSelectChat.value);
    
    try {
      for await (const res of client.introduce({ name: "Demo User" })) {
        print(res.sentence);
      }
    } catch (e) {
      print("Stream error: " + String(e));
    }
    
    startChat();
  };

  transportSelectStreams.onchange = () => {
    transportSelectChat.value = transportSelectStreams.value;
    setupTransport(transportSelectStreams.value);
  };

  print("What is your name?");
  const name = await prompt();
  print(`> ${name}`);

  for await (const res of client.introduce({ name })) {
    print(res.sentence);
  }

  startChat();
})();

function print(text: string): void {
  const div = document.createElement("div");
  div.classList.add("msg-bubble");

  if (text.startsWith("> ")) {
    div.classList.add("msg-user");
    div.innerText = text.substring(2);
  } else if (text.startsWith("[System]") || text.includes("error:")) {
    div.classList.add("msg-system");
    div.innerText = text;
  } else {
    div.classList.add("msg-eliza");
    div.innerText = text;
  }

  messagesList.append(div);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function prompt(signal?: AbortSignal): Promise<string> {
  const input = document.createElement("input");
  input.classList.add("chat-input");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.placeholder = "Type your message and press Enter...";
  input.value = "";
  inputContainer.innerHTML = "";
  inputContainer.append(input);
  input.focus();

  return new Promise<string>((resolve, reject) => {
    if (signal) {
      signal.addEventListener("abort", () => {
        inputContainer.innerHTML = "";
        reject(new Error("aborted"));
      });
    }
    input.onkeyup = (ev) => {
      if (ev.key == "Enter" && input.value.trim().length > 0) {
        const val = input.value.trim();
        input.onkeyup = null;
        resolve(val);
      }
    };
  });
}

// --- View 2: Concurrent Bidirectional Stream Lanes Visualizer ---
interface StreamLaneConfig {
  id: number;
  name: string;
  txCount: number;
  rxCount: number;
  isRunning: boolean;
  abortController?: AbortController;
}

const lanes: StreamLaneConfig[] = [
  { id: 1, name: "Stream Lane #1 ⚡", txCount: 0, rxCount: 0, isRunning: false },
  { id: 2, name: "Stream Lane #2 🌊", txCount: 0, rxCount: 0, isRunning: false },
  { id: 3, name: "Stream Lane #3 🚀", txCount: 0, rxCount: 0, isRunning: false },
  { id: 4, name: "Stream Lane #4 🔮", txCount: 0, rxCount: 0, isRunning: false },
];

let globalStreamsRunning = false;

function renderStreamLanes() {
  lanesContainer.innerHTML = "";
  lanes.forEach((lane) => {
    const card = document.createElement("div");
    card.id = `lane-card-${lane.id}`;
    card.className = `lane-card ${lane.isRunning ? "running" : ""}`;
    card.innerHTML = `
      <div class="lane-header">
        <div class="lane-title">
          <span>${lane.name}</span>
          <span id="lane-status-${lane.id}" class="status-badge ${lane.isRunning ? "active" : ""}">
            ${lane.isRunning ? "STREAM ACTIVE" : "IDLE"}
          </span>
        </div>
        <div class="lane-stats">
          <span class="stat-tag">TX Sent: <strong id="lane-tx-${lane.id}">${lane.txCount}</strong></span>
          <span class="stat-tag">RX Echo: <strong id="lane-rx-${lane.id}">${lane.rxCount}</strong></span>
        </div>
      </div>
      <div class="lane-tracks-wrapper">
        <div class="track-row">
          <span class="row-label label-tx">TX ➔</span>
          <div id="lane-track-tx-${lane.id}" class="lane-track"></div>
        </div>
        <div class="track-row">
          <span class="row-label label-rx">◀ RX</span>
          <div id="lane-track-rx-${lane.id}" class="lane-track"></div>
        </div>
      </div>
    `;
    lanesContainer.append(card);
  });
}

function createAnimatedPulse(laneId: number, type: "tx" | "rx", value: string) {
  const track = document.querySelector(`#lane-track-${type}-${laneId}`);
  if (!track) return;

  const node = document.createElement("div");
  node.className = `pulse-node ${type === "tx" ? "pulse-tx" : "pulse-rx"}`;
  node.innerText = `#${value}`;
  track.append(node);

  setTimeout(() => {
    node.remove();
  }, 1450);
}

async function runBidiStreamLane(lane: StreamLaneConfig) {
  lane.isRunning = true;
  lane.txCount = 0;
  lane.rxCount = 0;
  lane.abortController = new AbortController();

  const card = document.querySelector<HTMLElement>(`#lane-card-${lane.id}`);
  const statusBadge = document.querySelector<HTMLElement>(`#lane-status-${lane.id}`);
  const txElement = document.querySelector<HTMLElement>(`#lane-tx-${lane.id}`);
  const rxElement = document.querySelector<HTMLElement>(`#lane-rx-${lane.id}`);

  if (card) card.classList.add("running");
  if (statusBadge) {
    statusBadge.classList.add("active");
    statusBadge.innerText = "STREAM ACTIVE";
  }

  const signal = lane.abortController.signal;

  async function* generateNumbers() {
    for (let counter = 1; counter <= 20; counter++) {
      if (signal.aborted) break;

      lane.txCount++;
      if (txElement) txElement.innerText = String(lane.txCount);
      createAnimatedPulse(lane.id, "tx", String(counter));

      yield { sentence: `Msg #${counter} from ${lane.name}` };
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 400));
    }
  }

  try {
    for await (const res of client.converse(generateNumbers(), { signal })) {
      void res;
      lane.rxCount++;
      if (rxElement) rxElement.innerText = String(lane.rxCount);
      createAnimatedPulse(lane.id, "rx", String(lane.rxCount));
    }
  } catch (e) {
    if (!signal.aborted) {
      console.error(`Lane ${lane.id} stream error:`, e);
    }
  } finally {
    lane.isRunning = false;
    if (card) card.classList.remove("running");
    if (statusBadge) {
      statusBadge.classList.remove("active");
      statusBadge.innerText = "COMPLETED";
    }
  }
}

toggleStreamsBtn.onclick = () => {
  if (globalStreamsRunning) {
    // Stop all active streams
    lanes.forEach((lane) => lane.abortController?.abort());
    globalStreamsRunning = false;
    toggleStreamsBtn.classList.remove("active");
    toggleStreamsBtn.innerText = "▶ Start All Streams";
  } else {
    // Start four concurrent bidi RPCs using the selected streaming transport.
    globalStreamsRunning = true;
    toggleStreamsBtn.classList.add("active");
    toggleStreamsBtn.innerText = "⏹ Stop All Streams";

    lanes.forEach((lane) => {
      runBidiStreamLane(lane);
    });
  }
};
