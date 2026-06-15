// ===== SIMULADOR DE PUERTO SERIAL =====
class SimuladorPuertoSerial {
    constructor() {
        this.datosPuerto = [];
        this.conectado = false;
    }

    // Simular conexión a puerto serial
    async conectar() {
        console.log("Simulando conexión a puerto serial...");
        this.conectado = true;
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log("Conectado al puerto serial (simulación)");
                resolve(true);
            }, 1000);
        });
    }

    // Simular envío de datos al puerto serial
    async enviarDatos(datos) {
        if (!this.conectado) {
            console.warn("Puerto serial no conectado");
            return false;
        }

        console.log("Enviando datos al puerto serial:", datos);
        
        // Simular escritura en puerto serial
        return new Promise((resolve) => {
            setTimeout(() => {
                this.datosPuerto.push({
                    timestamp: new Date().toISOString(),
                    data: datos
                });
                console.log("Datos enviados exitosamente al puerto serial");
                resolve(true);
            }, 500);
        });
    }

    // Obtener historial de datos enviados
    obtenerHistorial() {
        return this.datosPuerto;
    }
}

const simuladorSerial = new SimuladorPuertoSerial();

// ===== ALMACENAMIENTO LOCAL DE RESULTADOS =====
class AlmacenamientoResultados {
    constructor() {
        this.resultados = [];
        this.cargarDesdeLocalStorage();
    }

    cargarDesdeLocalStorage() {
        const guardados = localStorage.getItem('detector_resultados');
        if (guardados) {
            this.resultados = JSON.parse(guardados);
        }
    }

    guardarEnLocalStorage() {
        localStorage.setItem('detector_resultados', JSON.stringify(this.resultados));
    }

    agregarResultado(frame, fps, pesoKg, intervalo) {
        const resultado = {
            id: this.resultados.length + 1,
            frame: frame,
            tiempo: (frame / fps).toFixed(2),
            peso: pesoKg,
            intervalo: intervalo,
            timestamp: new Date().toISOString(),
            estado: pesoKg ? 'detectado' : 'sin_deteccion'
        };

        this.resultados.push(resultado);
        this.guardarEnLocalStorage();
        
        // Actualizar displays
        this.actualizarDisplays();
        
        return resultado;
    }

    limpiarResultados() {
        this.resultados = [];
        this.guardarEnLocalStorage();
        this.actualizarDisplays();
    }

    obtenerResultados() {
        return this.resultados;
    }

    obtenerResultadosValidos() {
        return this.resultados.filter(r => r.peso && r.estado === 'detectado');
    }

    actualizarDisplays() {
        const total = this.resultados.length;
        const validos = this.obtenerResultadosValidos().length;
        
        if (document.getElementById('framesDisplay')) {
            document.getElementById('framesDisplay').textContent = total;
        }
        if (document.getElementById('detectionsDisplay')) {
            document.getElementById('detectionsDisplay').textContent = validos;
        }
    }

    // Exportar a CSV
    exportarCSV() {
        if (this.resultados.length === 0) {
            return null;
        }

        const headers = ['ID', 'Frame', 'Tiempo (s)', 'Carga (Kg)', 'Intervalo (ms)', 'Estado', 'Timestamp'];
        const rows = this.resultados.map(r => [
            r.id,
            r.frame,
            r.tiempo,
            r.peso || '--',
            r.intervalo,
            r.estado,
            r.timestamp
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }
}

const almacenamiento = new AlmacenamientoResultados();

// ===== CARGAR EL MODELO =====
let modelo;

async function cargarModelo() {
    actualizarEstado('Cargando modelo de detección...', 'info');
    
    try {
        modelo = await tf.loadGraphModel('../modelo/model.json');
        
        // Verificar modelo cargado
        const dummy = tf.zeros([1, 640, 640, 3]);
        const outs = modelo.execute(dummy);
        
        console.log('Modelo cargado correctamente. Estructura:', 
            Array.isArray(outs) ? outs.map(t => t.shape) : outs.shape);
        
        dummy.dispose();
        tf.dispose(outs);
        
        actualizarEstado('Modelo cargado correctamente', 'success');
        return true;
    } catch (error) {
        console.error('Error cargando modelo:', error);
        actualizarEstado('Error cargando modelo', 'error');
        return false;
    }
}

// ===== FUNCIÓN DE DETECCIÓN =====
async function detectarObjetos(video, ctx, canvas) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return tf.tidy(() => {
        const input = tf.browser.fromPixels(canvas)
            .resizeBilinear([640, 640])
            .toFloat()
            .div(255.0)
            .expandDims(0);

        const outs = modelo.execute(input);
        let data;

        // Manejar salida del modelo
        if (Array.isArray(outs)) {
            data = outs[0].dataSync();
        } else {
            data = outs.dataSync();
        }

        // Verificar shape para YOLOv8 [1,14,8400]
        if (data.length !== 14 * 8400) {
            console.warn('Shape inesperado, data.length:', data.length);
            tf.dispose(outs);
            return null;
        }

        const numPreds = 8400;
        const numAttrs = 14;
        let digitBoxes = [];

        // Procesar detecciones
        for (let i = 0; i < numPreds; i++) {
            let bestCls = -1;
            let bestProb = 0;
            
            for (let j = 4; j < numAttrs; j++) {
                const prob = data[i + j * numPreds];
                if (!isNaN(prob) && prob > bestProb) {
                    bestProb = prob;
                    bestCls = j - 4;
                }
            }
            
            const conf = bestProb;
            if (conf > 0.25 && !isNaN(conf)) {
                if (bestCls >= 0 && bestCls <= 9) {
                    const cx = data[i + 0 * numPreds];
                    const w = data[i + 2 * numPreds];
                    const x1 = cx - w / 2;
                    
                    if (!isNaN(x1) && !isNaN(cx) && !isNaN(w)) {
                        digitBoxes.push({ x1, digit: bestCls, conf });
                    }
                }
            }
        }

        tf.dispose(outs);

        if (!digitBoxes.length) {
            console.log('No se detectaron dígitos válidos');
            return null;
        }

        // Ordenar y filtrar dígitos
        digitBoxes.sort((a, b) => a.x1 - b.x1);
        
        // NMS básico
        let filteredBoxes = [];
        for (let det of digitBoxes) {
            let overlap = false;
            for (let prev of filteredBoxes) {
                if (Math.abs(det.x1 - prev.x1) < 20) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                filteredBoxes.push(det);
            }
        }
        
        digitBoxes = filteredBoxes.slice(0, 6);
        const digits = digitBoxes.map(d => d.digit.toString());
        const numberStr = digits.join("");

        // Validar resultado
        if (numberStr.length < 1 || numberStr.length > 6 || !/^\d+$/.test(numberStr)) {
            console.log('Número inválido:', numberStr);
            return null;
        }

        const number = parseInt(numberStr);
        if (isNaN(number) || !isFinite(number)) {
            return null;
        }

        console.log('Número detectado:', number, 'Dígitos:', digits);
        return number;
    });
}

// ===== SUBIR VIDEO =====
function uploadVideo() {
    const video = document.getElementById('videoFile').files[0];
    if (!video) {
        actualizarEstado('Debe seleccionar un video', 'error');
        return;
    }
    
    // Mostrar información del video
    const videoElement = document.createElement('video');
    videoElement.src = URL.createObjectURL(video);
    
    videoElement.addEventListener('loadedmetadata', () => {
        const duracion = videoElement.duration;
        const minutos = Math.floor(duracion / 60);
        const segundos = Math.floor(duracion % 60);
        
        actualizarEstado(
            `Video cargado: ${video.name} (${minutos}:${segundos.toString().padStart(2, '0')})`,
            'success'
        );
    });
}

// ===== PROCESAR VIDEO =====
async function processVideo(event) {
    if (event) event.preventDefault();

    const videoFile = document.getElementById('videoFile').files[0];
    const intervalo = parseInt(document.getElementById('intervalInput').value);

    if (!videoFile || !modelo) {
        actualizarEstado('Selecciona un video y espera que cargue el modelo', 'error');
        return;
    }

    if (isNaN(intervalo) || intervalo <= 0) {
        actualizarEstado('Ingresa un intervalo válido (ms)', 'error');
        return;
    }

    actualizarEstado('Cargando video y calculando FPS...', 'warning');

    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playbackRate = 16;

    await new Promise(res => video.addEventListener('loadeddata', res, { once: true }));

    let fps = 30;
    try {
        await video.play();
        await new Promise(res => setTimeout(res, 1000));
        const tiempoInicio = video.currentTime;
        await new Promise(res => setTimeout(res, 1000));
        const tiempoFin = video.currentTime;
        const framesAvanzados = (tiempoFin - tiempoInicio) * 30;
        if (framesAvanzados > 0) {
            fps = framesAvanzados;
        }
        video.pause();
        video.currentTime = 0;
    } catch (e) {
        console.warn('Error al calcular FPS:', e);
    }

    // Actualizar displays
    document.getElementById('fpsDisplay').textContent = fps.toFixed(2);
    const duracion = video.duration;
    const minutos = Math.floor(duracion / 60);
    const segundos = Math.floor(duracion % 60);
    document.getElementById('timeDisplay').textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 640;

    const interval_frames = Math.round((intervalo / 1000.0) * fps);
    if (interval_frames < 1) {
        actualizarEstado('Intervalo demasiado pequeño para el FPS', 'error');
        return;
    }

    actualizarEstado(`Procesando video (FPS: ${fps.toFixed(2)})...`, 'warning');

    const totalFrames = Math.floor(video.duration * fps);
    const resultados = [];
    let frame_num = 0;

    // Limpiar tabla de resultados
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';

    while (frame_num <= totalFrames) {
        video.currentTime = frame_num / fps;
        await new Promise(res => video.addEventListener('seeked', res, { once: true }));

        const numeroDetectado = await detectarObjetos(video, ctx, canvas);
        
        // Agregar resultado al almacenamiento
        const resultado = almacenamiento.agregarResultado(
            frame_num, 
            fps, 
            numeroDetectado, 
            intervalo
        );

        // Agregar a la tabla
        agregarFilaTabla(resultado);

        frame_num += interval_frames;
        
        // Actualizar progreso
        if (frame_num % (interval_frames * 10) === 0) {
            const porcentaje = Math.round((frame_num / totalFrames) * 100);
            actualizarEstado(`Procesando... ${porcentaje}% completado`, 'info');
        }
    }

    // Aplicar validación por promedio
    aplicarValidacionPromedio(resultados);

    actualizarEstado(
        `Procesamiento finalizado. ${almacenamiento.obtenerResultados().length} frames analizados.`,
        'success'
    );
}

// ===== FUNCIONES AUXILIARES =====
function actualizarEstado(mensaje, tipo = 'info') {
    const statusLabel = document.getElementById('statusLabel');
    let color = '';
    
    switch(tipo) {
        case 'success': color = 'text-green-600 bg-green-50'; break;
        case 'warning': color = 'text-yellow-600 bg-yellow-50'; break;
        case 'error': color = 'text-red-600 bg-red-50'; break;
        default: color = 'text-blue-600 bg-blue-50'; break;
    }
    
    statusLabel.innerHTML = `
        <div class="flex items-center gap-2 p-3 rounded-lg ${color}">
            <div class="w-3 h-3 rounded-full ${
                tipo === 'success' ? 'bg-green-500' : 
                tipo === 'warning' ? 'bg-yellow-500' : 
                tipo === 'error' ? 'bg-red-500' : 'bg-blue-500'
            }"></div>
            <span>${mensaje}</span>
        </div>
    `;
}

function agregarFilaTabla(resultado) {
    const tbody = document.querySelector('#resultTable tbody');
    const tr = document.createElement('tr');
    tr.className = resultado.peso ? 'bg-green-50' : 'bg-red-50';
    
    const estadoIcon = resultado.peso ? 
        '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' :
        '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
    
    tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
            ${resultado.frame}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${resultado.tiempo} s
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${
            resultado.peso ? 'text-green-700' : 'text-red-700'
        }">
            ${resultado.peso || '--'} Kg
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
            <div class="flex items-center gap-2">
                ${estadoIcon}
                <span class="${resultado.peso ? 'text-green-600' : 'text-red-600'}">
                    ${resultado.estado === 'detectado' ? 'Detección válida' : 'Sin detección'}
                </span>
            </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
            <button onclick="reenviarFrame(${resultado.id})" 
                class="px-3 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded transition-colors">
                Reenviar
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
}

function aplicarValidacionPromedio(resultados) {
    if (resultados.length > 2) {
        for (let i = 1; i < resultados.length - 1; i++) {
            let anterior = Number(resultados[i - 1].resultado);
            let siguiente = Number(resultados[i + 1].resultado);
            let actual = Number(resultados[i].resultado);

            if (!isNaN(anterior) && !isNaN(siguiente) && !isNaN(actual)) {
                let promedio = (anterior + siguiente) / 2;
                let candidato = Math.abs(promedio - anterior) < Math.abs(promedio - siguiente)
                    ? anterior : siguiente;

                if (Math.abs(actual - promedio) > Math.abs(candidato - promedio)) {
                    console.log(`Corregido frame ${resultados[i].frame}: ${actual} → ${candidato}`);
                    resultados[i].resultado = candidato.toString();
                }
            }
        }
    }
}

// ===== FUNCIONES DE EXPORTACIÓN =====
function exportarDatos() {
    const csvContent = almacenamiento.exportarCSV();
    
    if (!csvContent) {
        actualizarEstado('No hay datos para exportar', 'warning');
        return;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detector_resultados_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    actualizarEstado('Datos exportados como CSV', 'success');
}

async function enviarPuertoSerial() {
    const resultados = almacenamiento.obtenerResultadosValidos();
    
    if (resultados.length === 0) {
        actualizarEstado('No hay datos válidos para enviar', 'warning');
        return;
    }
    
    actualizarEstado('Conectando con puerto serial...', 'info');
    
    try {
        // Simular conexión
        await simuladorSerial.conectar();
        
        // Enviar cada resultado
        for (const resultado of resultados) {
            const datos = {
                id: resultado.id,
                tiempo: resultado.tiempo,
                carga: resultado.peso,
                frame: resultado.frame
            };
            
            await simuladorSerial.enviarDatos(datos);
            
            // Actualizar UI
            actualizarEstado(
                `Enviando datos ${resultado.id}/${resultados.length}...`,
                'info'
            );
        }
        
        actualizarEstado(
            `${resultados.length} registros enviados al puerto serial`,
            'success'
        );
        
    } catch (error) {
        console.error('Error enviando datos:', error);
        actualizarEstado('Error al enviar datos al puerto serial', 'error');
    }
}

function reenviarFrame(id) {
    const resultado = almacenamiento.obtenerResultados().find(r => r.id === id);
    
    if (!resultado) {
        actualizarEstado('Resultado no encontrado', 'error');
        return;
    }
    
    const datos = {
        id: resultado.id,
        tiempo: resultado.tiempo,
        carga: resultado.peso,
        frame: resultado.frame,
        retransmision: true
    };
    
    simuladorSerial.enviarDatos(datos)
        .then(() => {
            actualizarEstado(`Frame ${id} reenviado exitosamente`, 'success');
        })
        .catch(error => {
            actualizarEstado(`Error reenviando frame ${id}`, 'error');
        });
}

// ===== INICIALIZACIÓN =====
window.onload = async function() {
    // Cargar modelo
    await cargarModelo();
    
    // Configurar evento para limpiar resultados
    document.getElementById('videoFile').addEventListener('change', () => {
        almacenamiento.limpiarResultados();
    });
    
    // Inicializar displays
    almacenamiento.actualizarDisplays();
};