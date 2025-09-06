// --- CONFIG ---
// Replace with your Formspree endpoint:
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdklynlj";

// Optional: fallback email if API blocked (used in mailto link)
const FALLBACK_EMAIL = "matthewmarais14@gmail.com";

// LocalStorage key for offline queue
const QUEUE_KEY = "tp_feedback_queue_v1";

function byId(id){ return document.getElementById(id); }

function setStatus(msg, kind=""){
  const el = byId("form-status");
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function collectMeta(){
  byId("meta_userAgent").value = navigator.userAgent || "";
  byId("meta_viewport").value  = `${window.innerWidth}x${window.innerHeight}`;
  try { byId("meta_timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch(e){ byId("meta_timezone").value=""; }
  byId("meta_url").value = location.href;
  // If you track app versions, pipe it here; else leave blank.
  byId("meta_appver").value = "DocumentsTabletopPals — Major Alpha";
}

function serializeForm(form){
  const data = new FormData(form);
  const obj = {};
  for(const [k,v] of data.entries()){
    // skip honeypot if empty
    if(k === "company" && v) obj[k] = v;
    else if (k !== "company") obj[k] = v;
  }
  return obj;
}

function queuePush(payload){
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  q.push({ payload, t: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

async function attemptSyncQueue(){
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if(!q.length) return;
  const remaining = [];
  for(const item of q){
    try {
      await sendPayload(item.payload, {silent:true});
    } catch(e){
      remaining.push(item); // keep it for later
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

async function sendPayload(payload, opts={}){
  if(!FORMSPREE_ENDPOINT || FORMSPREE_ENDPOINT.includes("REPLACE_ME")){
    throw new Error("Endpoint not configured");
  }
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
  });
  if(!res.ok){
    const msg = await res.text().catch(()=>res.statusText);
    throw new Error(`Submit failed: ${res.status} ${msg}`);
  }
  return res.json().catch(()=> ({}));
}

function buildMailtoURL(payload){
  const subject = encodeURIComponent(`[TP Feedback] ${payload.category || "General"} (sev ${payload.severity || "?"})`);
  const lines = [];
  lines.push(`From: ${payload.name || "Anonymous"} <${payload.email || "n/a"}>`);
  lines.push(`Where: ${payload.where || "n/a"}`);
  lines.push(`Severity: ${payload.severity || "n/a"}`);
  lines.push("");
  lines.push(payload.details || "");
  lines.push("");
  lines.push("--- meta ---");
  lines.push(`URL: ${payload.meta_url || ""}`);
  lines.push(`UA: ${payload.meta_userAgent || ""}`);
  lines.push(`Viewport: ${payload.meta_viewport || ""}`);
  lines.push(`TZ: ${payload.meta_timezone || ""}`);
  lines.push(`App: ${payload.meta_appver || ""}`);
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;
}

function validate(form){
  if(form.company && form.company.value){ // honeypot filled -> bot
    throw new Error("Bot detected");
  }
  if(!form.category.value) throw new Error("Please select a category.");
  if(!form.details.value.trim()) throw new Error("Please describe your feedback.");
  if(!byId("consent").checked) throw new Error("Please agree to send your feedback.");
}

window.addEventListener("DOMContentLoaded", () => {
  collectMeta();
  attemptSyncQueue().catch(()=>{});

  const form = byId("feedback-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      validate(form);
      const payload = serializeForm(form);

      // If offline, queue and inform user
      if(!navigator.onLine){
        queuePush(payload);
        form.reset();
        collectMeta();
        setStatus("You’re offline. Saved locally — we’ll auto-send when you’re back online.", "success");
        return;
      }

      // Try Formspree
      await sendPayload(payload);
      form.reset();
      collectMeta();
      setStatus("Thank you! Your feedback has been submitted. 🎉", "success");

    } catch(err){
      console.error(err);
      // If API misconfigured or blocked, fall back to mailto
      const payload = serializeForm(form);
      const mailto = buildMailtoURL(payload);
      setStatus("Couldn’t submit automatically. Click to send by email instead.", "error");
      // Build a clickable fallback link
      const status = byId("form-status");
      const a = document.createElement("a");
      a.href = mailto;
      a.textContent = "Open email draft";
      a.className = "btn ghost";
      a.style.marginLeft = "10px";
      status.appendChild(a);
    }
  });

  window.addEventListener("online", attemptSyncQueue);
});
