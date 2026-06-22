import json
import os
from datetime import datetime

MEMORIA_FILE = os.path.join(os.path.dirname(__file__), "MEMORIA.json")

def cargar():
    if not os.path.exists(MEMORIA_FILE):
        return {"usuario": {}, "conocimiento": {}, "conversaciones": [], "ultima_actualizacion": ""}
    with open(MEMORIA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def guardar(memoria):
    memoria["ultima_actualizacion"] = datetime.now().isoformat()
    with open(MEMORIA_FILE, "w", encoding="utf-8") as f:
        json.dump(memoria, f, indent=2, ensure_ascii=False)

def main():
    memoria = cargar()
    print("\n=== APRENDIZ - Agente con memoria ===")
    print("Escribi 'salir' para terminar")
    print("Escribi 'que sabes?' para ver lo que aprendi\n")

    if memoria.get("usuario"):
        print(f"Ya te conozco, {memoria['usuario'].get('nombre', '!')}")
        print(f"He aprendido: {', '.join(memoria['conocimiento'].keys()) if memoria['conocimiento'] else 'aun nada'}")

    while True:
        entrada = input("\nTu: ").strip()
        if entrada.lower() == "salir":
            print("\nHasta luego! Voy a recordar todo.\n")
            break
        if "que sabes" in entrada.lower() or "que sabe" in entrada.lower():
            if memoria["usuario"]:
                print(f"\nSe que te llamas {memoria['usuario'].get('nombre', '?')}")
            else:
                print("\nAun no se nada de vos. Contame algo!")
            if memoria["conocimiento"]:
                print("Lo que aprendi:")
                for tema, detalle in memoria["conocimiento"].items():
                    print(f"  - {tema}: {detalle}")
            continue
        if "me llamo" in entrada.lower() or "soy " in entrada.lower():
            for p in ["me llamo ", "soy "]:
                if p in entrada.lower():
                    nombre = entrada.lower().split(p)[-1].split(",")[0].split(" y ")[0].strip().capitalize()
                    memoria["usuario"]["nombre"] = nombre
                    guardar(memoria)
                    print(f"\nEncantado, {nombre}! Ya lo recorde.")
                    break
            continue
        if "trabajo" in entrada.lower() or "estudio" in entrada.lower() or "gusta" in entrada.lower():
            tema = entrada.split(" ")[0] if entrada.split(" ")[0] != "" else "general"
            resumen = entrada[:100]
            memoria["conocimiento"][f"info_{len(memoria['conocimiento'])+1}"] = resumen
            memoria["conversaciones"].append({"fecha": datetime.now().isoformat(), "texto": resumen})
            guardar(memoria)
            print("\nEntendido! Lo guarde en mi memoria.")
            continue
        # cualquier otra cosa
        if entrada:
            memoria["conversaciones"].append({"fecha": datetime.now().isoformat(), "texto": entrada[:200]})
            guardar(memoria)
            print(f"\nGracias por contarme. Recordare esto.")
            print(f"Si queres que aprenda algo especifico, decimelo claro.")

if __name__ == "__main__":
    main()
