#!/usr/bin/env python3
"""Builds the ClipUGC HTTP-node n8n workflow JSON. Usage: build_workflow.py <out.json> [base_url]"""
import json
import sys
import uuid

out = sys.argv[1]
base_url = sys.argv[2] if len(sys.argv) > 2 else "https://clipugc.com/api/v2"

CRED = {"httpHeaderAuth": {"id": "REPLACE_ME", "name": "ClipUGC API key"}}
nodes, conns = [], {}


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "clipugc-n8n/" + name))


def add(name, type_, version, params, pos, **extra):
    n = {"parameters": params, "id": nid(name), "name": name, "type": type_, "typeVersion": version, "position": pos}
    n.update(extra)
    nodes.append(n)
    return name


def link(src, dst, out_index=0):
    outs = conns.setdefault(src, {"main": []})["main"]
    while len(outs) <= out_index:
        outs.append([])
    outs[out_index].append({"node": dst, "type": "main", "index": 0})


S = "$('Your settings').first().json"


def http(name, method, url, pos, body=None, auth=True, notes=None):
    p = {"method": method, "url": url, "options": {"response": {"response": {"neverError": True}}}}
    if auth:
        p["authentication"] = "genericCredentialType"
        p["genericAuthType"] = "httpHeaderAuth"
    if body is not None:
        p["sendBody"] = True
        p["specifyBody"] = "json"
        p["jsonBody"] = body
    extra = {"credentials": CRED} if auth else {}
    if notes:
        extra["notes"] = notes
    return add(name, "n8n-nodes-base.httpRequest", 4.2, p, pos, **extra)


def cond(left, op_type, operation, right=None):
    c = {"id": str(uuid.uuid4()), "leftValue": left, "operator": {"type": op_type, "operation": operation}}
    if right is None:
        c["operator"]["singleValue"] = True
        c["rightValue"] = ""
    else:
        c["rightValue"] = right
    return c


def if_node(name, conditions, pos, combinator="and"):
    return add(name, "n8n-nodes-base.if", 2.2, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
            "conditions": conditions,
            "combinator": combinator,
        },
        "looseTypeValidation": True,
        "options": {},
    }, pos)


def wait(name, pos):
    return add(name, "n8n-nodes-base.wait", 1.1,
               {"amount": "={{ " + S + ".poll_every_seconds }}", "unit": "seconds"}, pos, webhookId=nid(name + "/webhook"))


def setn(name, assignments, pos):
    return add(name, "n8n-nodes-base.set", 3.4, {
        "assignments": {"assignments": [
            {"id": str(uuid.uuid4()), "name": k, "value": v, "type": t} for k, v, t in assignments]},
        "options": {},
    }, pos)


def sticky(name, content, pos, w, h, color=None):
    p = {"content": content, "width": w, "height": h}
    if color:
        p["color"] = color
    add(name, "n8n-nodes-base.stickyNote", 1, p, pos)


Y = 400
add("Run workflow", "n8n-nodes-base.manualTrigger", 1, {}, [0, Y])

setn("Your settings", [
    ("base_url", base_url, "string"),
    ("influencer_mode", "public", "string"),
    ("influencer_description", "A friendly person in their late twenties with short dark hair, wearing a plain hoodie, sitting on a sofa at home", "string"),
    ("clip_prompt", "Looks down at the phone, eyes go wide in surprise, then looks up at the camera and smiles", "string"),
    ("app_recording_url", "https://example.com/your-app-screen-recording.mp4", "string"),
    ("hook_text", "POV: you found the app that plans your whole week", "string"),
    ("poll_every_seconds", 10, "number"),
    ("max_checks", 60, "number"),
], [220, Y])
link("Run workflow", "Your settings")

http("Get balance and prices", "GET", "={{ $json.base_url }}/credits", [440, Y])
link("Your settings", "Get balance and prices")

if_node("API key works?", [cond("={{ $json.statusCode }}", "number", "equals", 200)], [660, Y])
link("Get balance and prices", "API key works?")

if_node("Use a public AI influencer?", [cond("={{ " + S + ".influencer_mode }}", "string", "equals", "public")], [880, Y])
link("API key works?", "Use a public AI influencer?", 0)

# --- public branch
http("List public AI influencers", "GET", "={{ " + S + ".base_url }}/ai-characters?scope=discover&per_page=50", [1100, 200])
link("Use a public AI influencer?", "List public AI influencers", 0)

setn("Pick a public look", [
    ("look_id", "={{ ($json.data?.ai_characters ?? []).find(c => !c.is_locked && c.cover_image)?.cover_image.id ?? 0 }}", "number"),
    ("ai_influencer_id", "={{ ($json.data?.ai_characters ?? []).find(c => !c.is_locked && c.cover_image)?.id ?? 0 }}", "number"),
], [1320, 200])
link("List public AI influencers", "Pick a public look")

# --- create branch
http("Create AI influencer", "POST", "={{ " + S + ".base_url }}/ai-characters", [1100, 620],
     body="={{ JSON.stringify({ description: " + S + ".influencer_description }) }}")
link("Use a public AI influencer?", "Create AI influencer", 1)

if_node("AI influencer started?", [cond("={{ $json.statusCode }}", "number", "equals", 201)], [1320, 620])
link("Create AI influencer", "AI influencer started?")

wait("Wait for the look", [1540, 620])
link("AI influencer started?", "Wait for the look", 0)

http("Check the look", "GET",
     "={{ " + S + ".base_url }}/character-images/{{ $('Create AI influencer').first().json.data.reference_images[0].id }}/check-status",
     [1760, 620])
link("Wait for the look", "Check the look")

if_node("Look ready?", [cond("={{ $json.data?.status }}", "string", "equals", "completed")], [1980, 620])
link("Check the look", "Look ready?")

if_node("Keep waiting for the look?", [
    cond("={{ ['pending', 'processing'].includes($json.data?.status) }}", "boolean", "true"),
    cond("={{ $runIndex }}", "number", "lt", "={{ " + S + ".max_checks - 1 }}"),
], [1980, 840])
link("Look ready?", "Keep waiting for the look?", 1)
link("Keep waiting for the look?", "Wait for the look", 0)

setn("Use the new look", [
    ("look_id", "={{ $json.data.id }}", "number"),
    ("ai_influencer_id", "={{ $json.data.ai_character_id }}", "number"),
], [2200, 620])
link("Look ready?", "Use the new look", 0)

# --- clip
if_node("Have a look to animate?", [cond("={{ $json.look_id }}", "number", "gt", 0)], [2420, Y])
link("Pick a public look", "Have a look to animate?")
link("Use the new look", "Have a look to animate?")

http("Create 5 second clip", "POST", "={{ " + S + ".base_url }}/character-videos/image-to-video", [2640, Y],
     body="={{ JSON.stringify({ character_reference_image_id: $json.look_id, prompt: " + S + ".clip_prompt, duration: 5 }) }}")
link("Have a look to animate?", "Create 5 second clip", 0)

if_node("Clip started?", [cond("={{ $json.statusCode }}", "number", "equals", 201)], [2860, Y])
link("Create 5 second clip", "Clip started?")

wait("Wait for the clip", [3080, Y])
link("Clip started?", "Wait for the clip", 0)

http("Check the clip", "GET",
     "={{ " + S + ".base_url }}/character-videos/{{ $('Create 5 second clip').first().json.data.id }}/check-status", [3300, Y])
link("Wait for the clip", "Check the clip")

if_node("Clip ready?", [cond("={{ $json.data?.status }}", "string", "equals", "completed")], [3520, Y])
link("Check the clip", "Clip ready?")

if_node("Keep waiting for the clip?", [
    cond("={{ ['pending', 'processing'].includes($json.data?.status) }}", "boolean", "true"),
    cond("={{ $runIndex }}", "number", "lt", "={{ " + S + ".max_checks - 1 }}"),
], [3520, 620])
link("Clip ready?", "Keep waiting for the clip?", 1)
link("Keep waiting for the clip?", "Wait for the clip", 0)

# --- upload the app recording
http("Get an upload URL", "POST", "={{ " + S + ".base_url }}/uploads/presign", [3740, Y],
     body="={{ JSON.stringify({ purpose: 'app_video', extension: (" + S + ".app_recording_url.split('?')[0].split('.').pop() || 'mp4').toLowerCase() }) }}")
link("Clip ready?", "Get an upload URL", 0)

if_node("Upload URL ready?", [cond("={{ $json.statusCode }}", "number", "equals", 200)], [3960, Y])
link("Get an upload URL", "Upload URL ready?")

add("Download the app recording", "n8n-nodes-base.httpRequest", 4.2, {
    "url": "={{ " + S + ".app_recording_url }}",
    "options": {"response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}},
}, [4180, Y])
link("Upload URL ready?", "Download the app recording", 0)

add("Upload the app recording", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "PUT",
    "url": "={{ $('Get an upload URL').first().json.data.upload_url }}",
    "sendHeaders": True,
    "specifyHeaders": "json",
    "jsonHeaders": "={{ JSON.stringify(Object.fromEntries(Object.entries($('Get an upload URL').first().json.data.headers ?? {}).filter(([k]) => k.toLowerCase() !== 'host').map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))) }}",
    "sendBody": True,
    "contentType": "binaryData",
    "inputDataFieldName": "data",
    "options": {},
}, [4400, Y])
link("Download the app recording", "Upload the app recording")

# --- finished video
http("Make the finished video", "POST",
     "={{ " + S + ".base_url }}/character-videos/{{ $('Create 5 second clip').first().json.data.id }}/merge", [4620, Y],
     body="={{ JSON.stringify({ app_video_key: $('Get an upload URL').first().json.data.key, hook_text: " + S + ".hook_text }) }}")
link("Upload the app recording", "Make the finished video")

if_node("Finished video started?", [
    cond("={{ $json.statusCode }}", "number", "equals", 201),
    cond("={{ $json.data?.merged_video_id }}", "number", "gt", 0),
], [4840, Y])
link("Make the finished video", "Finished video started?")

wait("Wait for the finished video", [5060, Y])
link("Finished video started?", "Wait for the finished video", 0)

http("Check the finished video", "GET",
     "={{ " + S + ".base_url }}/merged-videos/{{ $('Make the finished video').first().json.data.merged_video_id }}", [5280, Y])
link("Wait for the finished video", "Check the finished video")

if_node("Finished video ready?", [cond("={{ $json.data?.status }}", "string", "equals", "completed")], [5500, Y])
link("Check the finished video", "Finished video ready?")

if_node("Keep waiting for the finished video?", [
    cond("={{ ['pending', 'processing'].includes($json.data?.status) }}", "boolean", "true"),
    cond("={{ $runIndex }}", "number", "lt", "={{ " + S + ".max_checks - 1 }}"),
], [5500, 620])
link("Finished video ready?", "Keep waiting for the finished video?", 1)
link("Keep waiting for the finished video?", "Wait for the finished video", 0)

http("Get the download link", "GET",
     "={{ " + S + ".base_url }}/merged-videos/{{ $('Make the finished video').first().json.data.merged_video_id }}/download", [5720, Y])
link("Finished video ready?", "Get the download link", 0)

if_node("Download link ready?", [cond("={{ $json.statusCode }}", "number", "equals", 200)], [5940, Y])
link("Get the download link", "Download link ready?")

setn("Result", [
    ("download_url", "={{ $json.data.download_url }}", "string"),
    ("finished_video_id", "={{ $('Make the finished video').first().json.data.merged_video_id }}", "number"),
    ("clip_id", "={{ $('Create 5 second clip').first().json.data.id }}", "number"),
    ("hook_text", "={{ " + S + ".hook_text }}", "string"),
    ("credits_before", "={{ $('Get balance and prices').first().json.data.balance }}", "number"),
    ("clip_cost", "={{ $('Get balance and prices').first().json.data.costs.clip }}", "number"),
    ("finished_video_cost", "={{ $('Get balance and prices').first().json.data.costs.merge }}", "number"),
], [6160, Y])
link("Download link ready?", "Result", 0)

# --- error stops
REFUSED = (
    "={{ $json.statusCode === 1002 ? 'Plan needed (code 1002). ' + ($json.errorMessage ?? 'ClipUGC API keys work on the Professional and Business plans.')"
    " : $json.statusCode === 1003 ? 'Out of credits (code 1003). ' + ($json.errorMessage ?? 'Not enough credits for this step') + '. Nothing was charged. Add credits or wait for the monthly credits, then run again.'"
    " : $json.statusCode === 401 ? 'ClipUGC did not accept the API key. Check the Header Auth credential: Name is Authorization, Value is Bearer followed by a space and your key.'"
    " : $json.statusCode === 429 ? 'Too many requests for this key. Wait a minute and run again.'"
    " : 'ClipUGC answered ' + ($json.statusCode ?? 'with an error') + ': ' + ($json.errorMessage ?? $json.message ?? JSON.stringify($json)) }}"
)
add("Stop: ClipUGC refused the request", "n8n-nodes-base.stopAndError", 1, {"errorMessage": REFUSED}, [3080, 1100])
for src in ["API key works?", "AI influencer started?", "Clip started?", "Upload URL ready?", "Finished video started?", "Download link ready?"]:
    link(src, "Stop: ClipUGC refused the request", 1)

FAILED = (
    "={{ $json.data?.status === 'failed'"
    " ? 'Generation failed. ClipUGC could not make this one. A failed generation gives its credits back. Change the prompt or run again.'"
    " : ['pending', 'processing'].includes($json.data?.status)"
    " ? 'Still not ready after ' + " + S + ".max_checks + ' checks. Nothing is lost. The generation keeps running on ClipUGC. Raise max_checks or look in your ClipUGC dashboard.'"
    " : 'ClipUGC answered ' + ($json.statusCode ?? 'with an error') + ': ' + ($json.errorMessage ?? JSON.stringify($json)) }}"
)
add("Stop: generation failed or took too long", "n8n-nodes-base.stopAndError", 1, {"errorMessage": FAILED}, [3520, 1100])
for src in ["Keep waiting for the look?", "Keep waiting for the clip?", "Keep waiting for the finished video?"]:
    link(src, "Stop: generation failed or took too long", 1)

add("Stop: no look to animate", "n8n-nodes-base.stopAndError", 1, {
    "errorMessage": "No AI influencer look was found. If influencer_mode is public, your account sees no unlocked public AI influencer. Set influencer_mode to create and describe your own."
}, [2420, 1100])
link("Have a look to animate?", "Stop: no look to animate", 1)

# --- notes
sticky("Note: start here", """## ClipUGC: UGC video with an AI influencer

This workflow makes one finished vertical UGC video for your app. It uses only HTTP Request nodes and the ClipUGC API.

**What it does**
1. Reads your credit balance and the current prices.
2. Picks a public AI influencer, or creates your own from a description.
3. Makes a 5 second silent reaction clip from your prompt.
4. Uploads your app screen recording from a URL.
5. Puts the clip, the recording and your hook line together.
6. Returns a download link for the finished MP4.

**Set up (2 minutes)**
1. Create an API key in ClipUGC: Dashboard, then API Keys. API keys need the Professional or Business plan.
2. In n8n create a **Header Auth** credential. Name: `Authorization`. Value: `Bearer YOUR_KEY`.
3. Open each HTTP Request node that shows a credential warning and pick that credential.
4. Open **Your settings** and fill in your prompt, hook line and the URL of your screen recording.
5. Click **Execute workflow**.
""", [-80, -260], 520, 560)

sticky("Note: settings", """## Your settings

- `influencer_mode`: `public` uses the first public AI influencer your plan unlocks. `create` designs a new one from `influencer_description`.
- `clip_prompt`: what the AI influencer does in the clip. Movement and expression. No speech, the clip is silent.
- `app_recording_url`: a direct link to an mp4 or mov of your app screen. n8n must be able to download it.
- `hook_text`: the line shown on top of the video. At most 150 characters.
- `poll_every_seconds` and `max_checks`: how often and how many times each wait loop checks. 10 and 60 means it gives up after 10 minutes per step.
""", [460, -260], 520, 330, 4)

sticky("Note: influencer", """## AI influencer

**Public**: any API key on a paid plan can use the public cast. Nothing to create, no extra credits.

**Create**: one call designs the AI influencer and starts the first look. The loop waits until the look is `completed`.

To always use the same AI influencer, run once, note `look_id`, then replace this part with a Set node that holds that id.
""", [1060, -120], 460, 280, 5)

sticky("Note: polling", """## Waiting for a generation

Every create call answers at once with status `pending`. The Wait node sleeps, the check node asks again, and the IF node leaves the loop when status is `completed`.

The loop stops by itself when status is `failed` or after `max_checks` checks. It can not run forever.
""", [3040, 120], 480, 230, 6)

sticky("Note: upload", """## App screen recording

The API takes the recording as a file, not as a link. These three nodes ask ClipUGC for an upload URL, download your file and send it there. The upload node needs no credential.

Uploaded files are deleted after 48 hours.
""", [3920, 150], 520, 200, 6)

sticky("Note: errors", """## The three errors you can hit

**Plan needed (HTTP 402, code 1002)**: the API key belongs to an account without the Professional or Business plan. Upgrade, then run again. The key itself stays valid.

**Out of credits (code 1003)**: the account does not have enough credits for this step. ClipUGC charges nothing for a refused call.

**Generation failed**: a look, clip or finished video ended with status `failed`. A failed generation gives its credits back. Change the prompt or run again.

Good to know: ClipUGC answers most errors with HTTP 200 and puts the real code in `statusCode` in the body. That is why every call here is followed by an IF node that reads `statusCode`.
""", [2380, 1240], 760, 380, 3)

wf = {
    "name": "ClipUGC: UGC video with an AI influencer (HTTP Request nodes)",
    "nodes": nodes,
    "connections": conns,
    "pinData": {},
    "settings": {"executionOrder": "v1"},
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [],
}
with open(out, "w") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"{out}: {len(nodes)} nodes")
