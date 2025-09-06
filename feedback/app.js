// --- CONFIG ---
// Replace with your Formspree endpoint (yours from earlier is kept here)
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdklynlj";

// Optional: fallback email if API blocked (used in mailto link)
const FALLBACK_EMAIL = "matthewmarais14@gmail.com";

// LocalStorage key for offline queue
const QUEUE_KEY = "tp_feedback_queue_v1";

// Shorthand
function byId(id){ return document.getElementById(id); }

// Status helper
function setStatus(msg, kind=""){
  const el = byId("form-status");
  if(!el) return;
  el.textContent = msg;
  el.className = `status ${kind}`;
}

// Collect device/app meta
function collectMeta(){
  byId("meta_userAgent").value = navigator.userAgent || "";
  byId("meta_viewport").value  = `${window.innerWidth}x${window.innerHeight}`;
  try { byId("meta_timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch(e){ byId("meta_timezone").value=""; }
  byId("meta_url").value = location.href;
  byId("meta_appver").value = "DocumentsTabletopPals — Major Alpha";
}

// Turn form into plain object (skips empty honeypot)
function serializeForm(form){
  const data = new FormData(form);
  const obj = {};
  for(const [k,v] of data.entries()){
    if(k === "company" && !v) continue; // honeypot empty -> ignore
    obj[k] = v;
  }
  return obj;
}

// Offline queue
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
    try { await sendPayload(item.payload); }
    catch(e){ remaining.push(item); }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

// POST helper
async function sendPayload(payload){
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

// Email fallback
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

// Validate required inputs
function validate(form){
  if(form.company && form.company.value){ // honeypot filled -> bot
    throw new Error("Bot detected");
  }
  if(!form.category.value) throw new Error("Please select a category.");
  if(!document.querySelector('input[name="severity"]:checked')) throw new Error("Please pick a severity (1–5).");
  if(!form.details.value.trim()) throw new Error("Please describe your feedback.");
  if(!byId("consent").checked) throw new Error("Please agree to send your feedback.");
}

// Alias generator
function randomAlias(){
  const adjectives = ["Brave","Clever","Mighty","Swift","Cunning","Lucky","Quiet","Bold","Arcane","Wandering"];
  const nouns      = ["Fox","Badger","Oak","Comet","Falcon","Wolf","Harbor","Willow","Lantern","Raven"];
  const num        = Math.floor(Math.random()*900)+100;
  return `${adjectives[Math.floor(Math.random()*adjectives.length)]}${nouns[Math.floor(Math.random()*nouns.length)]}-${num}`;
}

// Gate submit until ready
function updateSubmitState(){
  const btn   = byId("submit-btn");
  const hasCat = !!byId("category")?.value;
  const hasDet = !!byId("details")?.value.trim();
  const hasCon = !!byId("consent")?.checked;
  const hasSev = !!document.querySelector('input[name="severity"]:checked');
  if(btn) btn.disabled = !(hasCat && hasDet && hasCon && hasSev);
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  collectMeta();
  attemptSyncQueue().catch(()=>{});

  const form = byId("feedback-form");
  const aliasBtn = byId("alias-btn");

  // Input wiring for gating
  form.addEventListener("input", updateSubmitState);
  form.addEventListener("change", updateSubmitState);
  form.addEventListener("reset", () => { setTimeout(() => { collectMeta(); updateSubmitState(); setStatus(""); }, 0); });
  updateSubmitState();

  // Alias click
  aliasBtn?.addEventListener("click", () => {
    const name = byId("name");
    if(name){ name.value = randomAlias(); name.focus(); updateSubmitState(); }
  });

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      validate(form);
      const payload = serializeForm(form);

      if(!navigator.onLine){
        queuePush(payload);
        form.reset();
        collectMeta();
        updateSubmitState();
        setStatus("You’re offline. Saved locally — we’ll auto-send when you’re back online.", "success");
        return;
      }

      await sendPayload(payload);
      form.reset();
      collectMeta();
      updateSubmitState();
      setStatus("Thank you! Your feedback has been submitted. 🎉", "success");

    } catch(err){
      console.error(err);
      // mailto fallback
      const payload = serializeForm(form);
      const mailto = buildMailtoURL(payload);
      setStatus("Couldn’t submit automatically. Click to send by email instead.", "error");
      const a = document.createElement("a");
      a.href = mailto;
      a.textContent = "Open email draft";
      a.className = "btn ghost";
      a.style.marginLeft = "10px";
      byId("form-status").appendChild(a);
    }
  });

  // Auto-sync when back online
  window.addEventListener("online", attemptSyncQueue);
});
