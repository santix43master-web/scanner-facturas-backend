import json
import os
import urllib.request
import urllib.error
from datetime import datetime

MEMORIA_FILE = os.path.join(os.path.dirname(__file__), "MEMORIA.json")
OLLAMA_URL = "http://localhost:11434/api/chat"

def cargar():
    if not os.path.exists(MEMORIA_FILE):
        return {"usuario": {}, "conocimiento": {}, "conversaciones": [], "ultima_actualizacion": ""}
    with open(MEMORIA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def guardar(m):
    m["ultima_actualizacion"] = datetime.now().isoformat()
    with open(MEMORIA_FILE, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, ensure_ascii=False)

def preguntar(mensajes):
    try:
        data = json.dumps({"model": "llama3.2:1b", "messages": mensajes, "stream": False}).encode()
        req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())["message"]["content"]
    except Exception as e:
        return f"(error: {e})"

def main():
    memoria = cargar()
    print("\n=== MI IA - Asistente con memoria ===")
    print("Usando Ollama con llama3.2:1b - 100% local y gratis")
    print("Escribi 'salir' para terminar\n")

    if memoria.get("usuario"):
        print(f"¡Bienvenido de vuelta, {memoria['usuario'].get('nombre', 'desconocido')}!")
    if memoria.get("conocimiento"):
        print(f"Recuerdo {len(memoria['conocimiento'])} cosas sobre vos.\n")

    system = "Sos un asistente personal. Respondes en español paraguayo (voseo). Sos cálido, cercano y directo."

    if memoria.get("usuario"):
        system += f"\n\nSobre el usuario: {json.dumps(memoria['usuario'])}"
    if memoria.get("conocimiento"):
        system += f"\n\nLo que aprendiste antes: {json.dumps(memoria['conocimiento'])}"

    hist = [{"role": "system", "content": system}]

    while True:
        entrada = input("Vos: ").strip()
        if entrada.lower() == "salir":
            print("\n¡Hasta luego! Voy a recordar todo.\n")
            break

        hist.append({"role": "user", "content": entrada})
        respuesta = preguntar(hist)
        print(f"\nIA: {respuesta}\n")
        hist.append({"role": "assistant", "content": respuesta})

        entrada_bajada = entrada.lower()
        if any(p in entrada_bajada for p in ["soy ", "me llamo", "trabajo", "estudio", "gusta", "tengo "]):
            if "usuario" not in memoria: memoria["usuario"] = {}
            for p in ["me llamo ", "soy "]:
                if p in entrada_bajada:
                    nombre = entrada_bajada.split(p)[-1].split(",")[0].split(" y ")[0].strip().capitalize()
                    if nombre:
                        memoria["usuario"]["nombre"] = nombre
                    break
            memoria["conocimiento"][f"info_{len(memoria['conocimiento'])+1}"] = entrada[:200]

        memoria["conversaciones"].append({"fecha": datetime.now().isoformat(), "vos": entrada[:200], "ia": respuesta[:200]})
        guardar(memoria)

if __name__ == "__main__":
    main()
