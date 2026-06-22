@app.post("/escanear")
async def escanear(file: UploadFile = File(...)):
    try:
        contenido = await file.read()
        b64_image = base64.b64encode(contenido).decode("utf-8")
        resultado = interpretacion.extraer_datos_factura([b64_image])
        return resultado
    except RuntimeError as e:
        # Si Claude está saturado, enviamos un mensaje amigable
        if "529" in str(e) or "Overloaded" in str(e):
            return {"error": "El servidor de la IA está saturado. Por favor, reintenta en 10 segundos."}
        return {"error": str(e)}