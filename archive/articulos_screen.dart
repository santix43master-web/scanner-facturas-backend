import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../core/api_config.dart';

class ArticulosScreen extends StatefulWidget {
  const ArticulosScreen({super.key});
  @override
  State<ArticulosScreen> createState() => _ArticulosScreenState();
}

class _ArticulosScreenState extends State<ArticulosScreen> {
  List<dynamic> articulos = [];
  bool isLoading = false;

  final _filtroDescripcionController = TextEditingController();
  final _filtroCodigoBarraController = TextEditingController();

  Future<void> buscarArticulos() async {
    if (!mounted) return;
    setState(() => isLoading = true);

    try {
      String url = '${ApiConfig.baseUrl}/articulos?';
      bool tieneFiltro = false;

      if (_filtroDescripcionController.text.trim().isNotEmpty) {
        url += 'descripcion=${Uri.encodeComponent(_filtroDescripcionController.text.trim())}&';
        tieneFiltro = true;
      }
      if (_filtroCodigoBarraController.text.trim().isNotEmpty) {
        url += 'codigo_barra=${Uri.encodeComponent(_filtroCodigoBarraController.text.trim())}&';
        tieneFiltro = true;
      }

      if (!tieneFiltro) {
        if (mounted) setState(() => articulos = []);
        if (mounted) setState(() => isLoading = false);
        return;
      }

      final res = await http.get(Uri.parse(url));
      if (res.statusCode == 200 && mounted) {
        final data = res.body.isNotEmpty ? json.decode(res.body) : [];
        setState(() => articulos = data);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      }
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  void nuevoArticulo() => _mostrarForm(false, null);
  void editarArticulo(dynamic art) => _mostrarForm(true, art);

  void _mostrarForm(bool esEdicion, dynamic articulo) {
    showDialog(
      context: context,
      builder: (_) => SimpleArticuloForm(esEdicion: esEdicion, articulo: articulo),
    ).then((_) {
      if (mounted && (_filtroDescripcionController.text.trim().isNotEmpty || 
                     _filtroCodigoBarraController.text.trim().isNotEmpty)) {
        buscarArticulos();
      }
    });
  }

  void _escanearParaBuscar() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const BarcodeScannerScreen()),
    );
    if (result != null && mounted) {
      setState(() => _filtroCodigoBarraController.text = result);
      buscarArticulos();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Artículos")),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(child: TextField(controller: _filtroDescripcionController, decoration: const InputDecoration(labelText: "Descripción"))),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Row(
                            children: [
                              Expanded(child: TextField(controller: _filtroCodigoBarraController, decoration: const InputDecoration(labelText: "Código de Barra"))),
                              IconButton(icon: const Icon(Icons.camera_alt, color: Colors.blue, size: 28), onPressed: _escanearParaBuscar),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(onPressed: buscarArticulos, icon: const Icon(Icons.search), label: const Text("Buscar")),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : articulos.isEmpty
                    ? const Center(child: Text("Use los filtros para buscar"))
                    : ListView.builder(
                        itemCount: articulos.length,
                        itemBuilder: (context, i) {
                          final a = articulos[i];
                          return Card(
                            margin: const EdgeInsets.all(8),
                            child: ListTile(
                              title: Text(a['desc_bien_servicio']?.toString() ?? ''),
                              subtitle: Text("Código Barra: ${a['codigo_barra'] ?? '-'} | Stock: ${a['cant_existencia'] ?? 0}"),
                              trailing: IconButton(icon: const Icon(Icons.edit), onPressed: () => editarArticulo(a)),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(onPressed: nuevoArticulo, child: const Icon(Icons.add)),
    );
  }
}

// ==================== FORMULARIO ====================
class SimpleArticuloForm extends StatefulWidget {
  final bool esEdicion;
  final dynamic articulo;
  const SimpleArticuloForm({super.key, required this.esEdicion, this.articulo});

  @override
  State<SimpleArticuloForm> createState() => _SimpleArticuloFormState();
}

class _SimpleArticuloFormState extends State<SimpleArticuloForm> {
  final _grupoController = TextEditingController();
  final _codController = TextEditingController();
  final _descController = TextEditingController();
  final _pcostoController = TextEditingController();
  final _pventaController = TextEditingController();
  final _barraController = TextEditingController();
  final _stockController = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.esEdicion && widget.articulo != null) {
      _grupoController.text = widget.articulo['cod_grupo_bien_servicio']?.toString() ?? '';
      _codController.text = widget.articulo['cod_bien_servicio']?.toString() ?? '';
      _descController.text = widget.articulo['desc_bien_servicio']?.toString() ?? '';
      _pcostoController.text = widget.articulo['precio_costo']?.toString() ?? '';
      _pventaController.text = widget.articulo['precio_venta']?.toString() ?? '';
      _barraController.text = widget.articulo['codigo_barra']?.toString() ?? '';
      _stockController.text = widget.articulo['cant_existencia']?.toString() ?? '';
    }
  }

  void _escanearCodigo() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const BarcodeScannerScreen()),
    );
    if (result != null && mounted) {
      setState(() => _barraController.text = result);
    }
  }

  Future<void> _guardar() async {
    final data = {
      "cod_grupo_bien_servicio": int.tryParse(_grupoController.text) ?? 0,
      "cod_bien_servicio": int.tryParse(_codController.text) ?? 0,
      "desc_bien_servicio": _descController.text.trim(),
      "precio_costo": double.tryParse(_pcostoController.text) ?? 0,
      "precio_venta": double.tryParse(_pventaController.text) ?? 0,
      "codigo_barra": _barraController.text.trim(),
      "cant_existencia": double.tryParse(_stockController.text) ?? 0,
      "activo": "S"
    };

    try {
      late http.Response response;
      if (widget.esEdicion) {
        final url = '${ApiConfig.baseUrl}/articulos/${widget.articulo['cod_grupo_bien_servicio']}/${widget.articulo['cod_bien_servicio']}';
        response = await http.put(Uri.parse(url), headers: {'Content-Type': 'application/json'}, body: json.encode(data));
      } else {
        response = await http.post(Uri.parse('${ApiConfig.baseUrl}/articulos'), headers: {'Content-Type': 'application/json'}, body: json.encode(data));
      }

      if ((response.statusCode == 200 || response.statusCode == 201) && mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("✅ Guardado correctamente"), backgroundColor: Colors.green));
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error ${response.statusCode}")));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.esEdicion ? "Editar Artículo" : "Nuevo Artículo"),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _grupoController, decoration: const InputDecoration(labelText: "Código Grupo"), keyboardType: TextInputType.number),
            TextField(controller: _codController, decoration: const InputDecoration(labelText: "Código Artículo"), keyboardType: TextInputType.number),
            TextField(controller: _descController, decoration: const InputDecoration(labelText: "Descripción *")),
            TextField(controller: _pcostoController, decoration: const InputDecoration(labelText: "Precio Costo"), keyboardType: TextInputType.number),
            TextField(controller: _pventaController, decoration: const InputDecoration(labelText: "Precio Venta"), keyboardType: TextInputType.number),
            Row(
              children: [
                Expanded(child: TextField(controller: _barraController, decoration: const InputDecoration(labelText: "Código de Barra"))),
                IconButton(icon: const Icon(Icons.camera_alt, color: Colors.blue), onPressed: _escanearCodigo),
              ],
            ),
            TextField(controller: _stockController, decoration: const InputDecoration(labelText: "Stock"), keyboardType: TextInputType.number),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancelar")),
        ElevatedButton(onPressed: _guardar, child: const Text("Guardar")),
      ],
    );
  }
}

// ==================== ESCANER ====================
// ==================== ESCANER MEJORADO ====================
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Escanear Código de Barra")),
      body: MobileScanner(
        controller: MobileScannerController(
          detectionSpeed: DetectionSpeed.normal,
          facing: CameraFacing.back,
          torchEnabled: false,
        ),
        errorBuilder: (context, error, child) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.camera_alt, size: 80, color: Colors.red),
                  const SizedBox(height: 16),
                  const Text("Error al abrir la cámara", style: TextStyle(fontSize: 18)),
                  const SizedBox(height: 8),
                  Text(error.errorDetails?.message ?? error.toString(), textAlign: TextAlign.center),
                  const SizedBox(height: 20),
                  ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text("Volver")),
                ],
              ),
            ),
          );
        },
        onDetect: (capture) {
          for (final barcode in capture.barcodes) {
            if (barcode.rawValue != null) {
              Navigator.pop(context, barcode.rawValue);
              return;
            }
          }
        },
      ),
    );
  }
}