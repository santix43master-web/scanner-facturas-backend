import json, os, urllib.request, threading, socket
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

MEMORIA_FILE = os.path.join(os.path.dirname(__file__), "MEMORIA.json")
OLLAMA_URL = "http://localhost:11434/api/chat"

HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Mi IA</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0D1B2A;color:#fff;height:100vh;display:flex;flex-direction:column}
.status-bar{display:flex;gap:12px;padding:6px 20px;font-size:11px;color:#546E7A;background:#0f1f2f;border-bottom:1px solid #2A3F4F;align-items:center}
.status-bar .dot{width:6px;height:6px;border-radius:50%;background:#4CAF50}
.status-bar .pensando{color:#FFB300;font-style:italic}
.chat{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:80%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.msg.user{background:#00BCD4;color:#0D1B2A;align-self:flex-end;border-bottom-right-radius:4px}
.msg.ia{background:#1B2838;color:#B0BEC5;align-self:flex-start;border-bottom-left-radius:4px;border:1px solid #2A3F4F}
.msg.web{background:rgba(255,152,0,.1);color:#FFB300;align-self:center;font-size:11px;border:1px solid rgba(255,152,0,.2);border-radius:8px;padding:6px 12px}
.input-area{border-top:1px solid #2A3F4F;padding:16px 24px;display:flex;gap:12px;background:#0f1f2f}
.input-area input{flex:1;padding:12px;border-radius:12px;border:1px solid #2A3F4F;background:#1B2838;color:#fff;font-size:14px;outline:none}
.input-area input:focus{border-color:#00BCD4}
.input-area button{padding:12px 24px;border-radius:12px;border:none;background:#00BCD4;color:#0D1B2A;font-weight:700;cursor:pointer}
.input-area button:disabled{opacity:.4;cursor:not-allowed}
</style></head><body>
<div class="status-bar"><span class="dot"></span> qwen2.5:0.5b <span class="pensando" id="status"></span></div>
<div class="chat" id="chat"></div>
<div class="input-area"><input id="input" placeholder="Escribi..." autofocus/><button id="btn" onclick="enviar()">Enviar</button></div>
<script>
const chat=document.getElementById('chat'),input=document.getElementById('input'),btn=document.getElementById('btn'),status=document.getElementById('status');
input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();enviar()}});
function addMsg(t, c){const d=document.createElement('div');d.className='msg '+c;d.textContent=t;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
async function enviar(){
const t=input.value.trim();if(!t)return;input.value='';addMsg(t,'user');btn.disabled=true;input.disabled=true;status.textContent='pensando...';
try{const r=await fetch('/chat',{method:'POST',body:JSON.stringify({msg:t}),headers:{'Content-Type':'application/json'}});
const d=await r.json();if(d.w)addMsg(d.w,'web');addMsg(d.r,'ia')}catch(e){addMsg('Error: '+e.message,'ia')}
btn.disabled=false;input.disabled=false;status.textContent='';input.focus()}
</script></body></html>"""

def cargar():
    if not os.path.exists(MEMORIA_FILE): return {"usuario":{},"conocimiento":{},"conversaciones":[],"ultima_actualizacion":""}
    with open(MEMORIA_FILE, "r", encoding="utf-8") as f: return json.load(f)

def guardar(m):
    m["ultima_actualizacion"] = datetime.now().isoformat()
    with open(MEMORIA_FILE, "w", encoding="utf-8") as f: json.dump(m, f, indent=2, ensure_ascii=False)

def buscar_web(query):
    try:
        from ddgs import DDGS
        resultados = list(DDGS().text(query[:100], max_results=3))
        if not resultados: return ""
        texto = "\n".join([f"- {r['title']}: {r['body'][:200]}" for r in resultados])
        return f"\n\nInformacion de internet sobre '{query}':\n{texto}"
    except:
        return ""

memoria = cargar()
historial = [{"role":"system","content":"Sos un asistente paraguayo con acceso a internet. Si te preguntan algo actual o desconocido, usa la info de internet que te damos. Sos cálido, cercano."}]
if memoria.get("usuario"): historial[0]["content"] += f"\n\nUsuario: {json.dumps(memoria['usuario'])}"
if memoria.get("conocimiento"): historial[0]["content"] += f"\n\nAprendiste: {json.dumps(memoria['conocimiento'])}"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type","text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML.encode("utf-8"))
    def do_POST(self):
        global historial, memoria
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))))
            entrada = body.get("msg","")

            # Buscar en internet si parece necesario
            contexto_web = ""
            palabras_clave = ["busca", "buscá", "googlea", "internet", "que es", "quien es", "noticias", "ultimas", "hoy", "ahora", "clima", "precio", "cotizacion", "dolar", "noticia"]
            if any(p in entrada.lower() for p in palabras_clave):
                contexto_web = buscar_web(entrada)
                if contexto_web:
                    historial.append({"role":"system","content":f"Contexto de internet:{contexto_web}. Responde en español paraguayo natural, no digas 'según internet'."})

            historial.append({"role":"user","content":entrada})
            data = json.dumps({"model":"qwen2.5:0.5b","messages":historial,"stream":False,"options":{"num_predict":200,"num_ctx":2048}}).encode()
            req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type":"application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.loads(r.read())["message"]["content"]
            historial.append({"role":"assistant","content":resp})

            # Quitar contexto web del historial si se agregó
            if contexto_web: historial.pop(-3)

            entrada_bajada = entrada.lower()
            if any(p in entrada_bajada for p in ["soy ","me llamo"]):
                if "usuario" not in memoria: memoria["usuario"]={}
                for p in ["me llamo ","soy "]:
                    if p in entrada_bajada:
                        n = entrada_bajada.split(p)[-1].split(",")[0].strip().capitalize()
                        if n: memoria["usuario"]["nombre"]=n; break
                memoria["conocimiento"][f"i{len(memoria.get('conocimiento',{}))+1}"] = entrada[:200]
            memoria.setdefault("conversaciones",[]).append({"fecha":datetime.now().isoformat(),"vos":entrada[:200],"ia":resp[:200]})
            guardar(memoria)
            self.send_response(200)
            self.send_header("Content-Type","application/json")
            self.end_headers()
            w = "🌐 Busqué en internet" if contexto_web else ""
            self.wfile.write(json.dumps({"r":resp, "w":w}).encode())
        except Exception as e:
            self.send_response(200)
            self.send_header("Content-Type","application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"r":f"Error: {str(e)[:150]}"}).encode())

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(("127.0.0.1", 0))
puerto = sock.getsockname()[1]
sock.close()
print(f"\n=== MI IA ===")
print(f"http://localhost:{puerto}")
server = HTTPServer(("127.0.0.1", puerto), Handler)
threading.Thread(target=lambda: __import__('webbrowser').open(f"http://localhost:{puerto}"), daemon=True).start()
server.serve_forever()
