// --- CONFIG ---
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdklynlj"; // your live endpoint
const FALLBACK_EMAIL = "matthewmarais14@gmail.com";            // mailto fallback
const QUEUE_KEY = "tp_feedback_queue_v1";

// Shorthand
const byId = (id)=>document.getElementById(id);

// Status helper
function setStatus(msg, kind=""){
  const el = byId("form-status");
  if(!el) return;
  el.textContent = msg;
  el.className = `status ${kind}`;
}

// Meta
function collectMeta(){
  byId("meta_userAgent").value = navigator.userAgent || "";
  byId("meta_viewport").value  = `${window.innerWidth}x${window.innerHeight}`;
  try { byId("meta_timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch { byId("meta_timezone").value = ""; }
  byId("meta_url").value = location.href;
  byId("meta_appver").value = "DocumentsTabletopPals — Major Alpha";
}

// Serialize (skip empty honeypot)
function serializeForm(form){
  const data = new FormData(form);
  const obj = {};
  for (const [k,v] of data.entries()){
    if (k === "company" && !v) continue;
    obj[k] = typeof v === "string" ? v.trim() : v;
  }
  return obj;
}

// Email validation + sanitization
function isValidEmail(s){
  if(!s) return false;
  const v = s.trim();
  // simple robust pattern: text@text.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
function sanitizeEmail(obj){
  if(typeof obj.email === "string" && !isValidEmail(obj.email)){
    delete obj.email; // remove invalid so Formspree won’t 422
  }
  return obj;
}

// Normalize payload for Formspree
function normalizePayload(p){
  const q = sanitizeEmail({ ...p });

  if(!q.category) q.category = "Other";
  if(!q.severity) q.severity = "3";

  // Ensure details not empty; fold context if needed
  const details = (q.details || "").trim();
  if(!details){
    const parts = [];
    if(q.where) parts.push(`Where: ${q.where}`);
    if(q.name)  parts.push(`From: ${q.name}`);
    if(q.email) parts.push(`Email: ${q.email}`);
    q.details = parts.length ? parts.join("\n") : "(no details provided)";
  }

  // Convenience single-field summary
  q.message = `${q.category} (sev ${q.severity}) — ${q.details}`;

  return q;
}

// Queue
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
    try{
      await sendPayload(normalizePayload(item.payload));
    }catch(e){
      remaining.push(item);
      console.warn("[Feedback] queue send failed:", e?.message || e);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

// POST
async function sendPayload(payload){
  if(!FORMSPREE_ENDPOINT || FORMSPREE_ENDPOINT.includes("REPLACE_ME")){
    throw new Error("Endpoint not configured");
  }
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify(payload),
  });
  if(!res.ok){
    const msg = await res.text().catch(()=>res.statusText);
    throw new Error(`Submit failed: ${res.status} ${msg}`);
  }
  return res.json().catch(()=> ({}));
}

// mailto fallback
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
  return `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
}

// Validate required fields (and email if present)
function validate(form){
  if(form.company && form.company.value){ throw new Error("Bot detected"); }
  if(!form.category.value){ throw new Error("Please select a category."); }
  if(!document.querySelector('input[name="severity"]:checked')){ throw new Error("Please pick a severity (1–5)."); }
  if(!form.details.value.trim()){ throw new Error("Please describe your feedback."); }
  if(!byId("consent").checked){ throw new Error("Please agree to send your feedback."); }
  const emailVal = byId("email").value;
  if(emailVal && !isValidEmail(emailVal)){ throw new Error("Please enter a valid email or leave it blank."); }
}

// Alias
function randomAlias(){
  const adjectives = ["Brave","Clever","Mighty","Swift","Cunning","Lucky","Quiet","Bold","Arcane","Wandering"];
  const nouns      = ["Fox","Badger","Oak","Comet","Falcon","Wolf","Harbor","Willow","Lantern","Raven"];
  const num        = Math.floor(Math.random()*900)+100;
  return `${adjectives[Math.floor(Math.random()*adjectives.length)]}${nouns[Math.floor(Math.random()*nouns.length)]}-${num}`;
}

// Gate submit (now also checks email validity if present)
function updateSubmitState(){
  const btn   = byId("submit-btn");
  const hasCat = !!byId("category")?.value;
  const hasDet = !!byId("details")?.value.trim();
  const hasCon = !!byId("consent")?.checked;
  const hasSev = !!document.querySelector('input[name="severity"]:checked');
  const email  = byId("email")?.value?.trim() || "";
  const emailOk = !email || isValidEmail(email);
  if(btn) btn.disabled = !(hasCat && hasDet && hasCon && hasSev && emailOk);
}

window.addEventListener("DOMContentLoaded", () => {
  collectMeta();
  attemptSyncQueue().catch(()=>{});

  const form = byId("feedback-form");
  const aliasBtn = byId("alias-btn");
  const emailEl = byId("email");

  // live gating
  form.addEventListener("input", updateSubmitState);
  form.addEventListener("change", updateSubmitState);
  form.addEventListener("reset", () => {
    setTimeout(() => { collectMeta(); setStatus(""); updateSubmitState(); }, 0);
  });
  // optional UI validity message for email
  emailEl?.addEventListener("input", () => {
    if(emailEl.value && !isValidEmail(emailEl.value)){
      emailEl.setCustomValidity("Please enter a valid email or leave it blank.");
    }else{
      emailEl.setCustomValidity("");
    }
  });
  updateSubmitState();

  // alias
  aliasBtn?.addEventListener("click", () => {
    const name = byId("name");
    if(name){ name.value = randomAlias(); name.focus(); updateSubmitState(); }
  });

  // submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    try{
      validate(form);
      const payload = normalizePayload(serializeForm(form));

      if(!navigator.onLine){
        queuePush(payload);
        form.reset(); collectMeta(); updateSubmitState();
        setStatus("You’re offline. Saved locally — we’ll auto-send when you’re back online.", "success");
        return;
      }

      await sendPayload(payload);
      form.reset(); collectMeta(); updateSubmitState();
      setStatus("Thank you! Your feedback has been submitted. 🎉", "success");
    }catch(err){
      console.error(err);
      const payload = normalizePayload(serializeForm(form));
      const a = document.createElement("a");
      a.href = buildMailtoURL(payload);
      a.textContent = "Open email draft";
      a.className = "btn ghost";
      a.style.marginLeft = "10px";
      setStatus("Couldn’t submit automatically. Click to send by email instead.", "error");
      byId("form-status").appendChild(a);
    }
  });

  window.addEventListener("online", attemptSyncQueue);
});
