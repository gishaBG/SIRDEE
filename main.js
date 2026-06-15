// === FUNCIÓN PARA TRUNCAR A 5 DECIMALES ===
function truncar5Decimales(num) {
    if (num == null || isNaN(num)) return '0.00000';
    const numFloat = parseFloat(num);
    if (isNaN(numFloat)) return '0.00000';
    return (Math.trunc(numFloat * 100000) / 100000).toFixed(5);
}

// Variables globales para el puerto serial y el control de muestreo
let port = null;
let reader = null;
let keepReading = false;
let datos = []; // Almacena TODAS las lecturas
let buffer = '';
let intervaloMuestreo = 1000; // Intervalo de muestreo en MILISEGUNDOS (1 segundo por defecto)
let ultimaLecturaTiempo = 0; // Para controlar cuándo mostrar el último dato
let contadorLecturas = 0; // Contador de lecturas recibidas
let startTime = null; // Tiempo de inicio de la lectura
let miGrafica = null; // Variable global para la gráfica

let tiempoInicio = null;      // Momento en que inicia la captura
let tiempoActual = 0;        // Tiempo acumulado en segundos

// Variables globales para el control de grabación
let estaGrabando = false;
let datosGrabados = []; // Datos que se están grabando actualmente
let tiempoInicioGrabacion = null;

// Variables globales adicionales para mejorar la interfaz
let availablePorts = [];

// === FUNCIÓN PARA ACTUALIZAR CONTROLES DE GRABACIÓN ===
function actualizarControlesGrabacion() {
    const btnGrabar = document.getElementById('btnGrabar');

    // Verificar que el elemento exista antes de manipularlo
    if (!btnGrabar) {
        console.warn('Elemento de control de grabación no encontrado');
        return;
    }

    if (estaGrabando) {
        // Modo grabando activo
        btnGrabar.disabled = false;
        btnGrabar.innerHTML = `
            <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v6H9v-6z" />
            </svg>
            Detener Grabación
        `;
        btnGrabar.classList.remove('bg-green-600', 'hover:bg-green-700');
        btnGrabar.classList.add('bg-red-600', 'hover:bg-red-700');

        // Actualizar estado
        actualizarEstadoConexion('leyendo', `Grabando... ${datosGrabados.length} lecturas`);
    } else {
        // Modo listo para grabar
        btnGrabar.disabled = false;
        btnGrabar.innerHTML = `
            <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Iniciar Grabación
        `;
        btnGrabar.classList.remove('bg-red-600', 'hover:bg-red-700');
        btnGrabar.classList.add('bg-green-600', 'hover:bg-green-700');

        // Actualizar estado
        if (datosGrabados.length > 0) {
            actualizarEstadoConexion('conectado', `Listo. ${datosGrabados.length} lecturas grabadas`);
        } else {
            actualizarEstadoConexion('conectado', 'Conectado. Listo para grabar');
        }
    }
}

// === FUNCIÓN PARA INICIAR GRABACIÓN ===
function iniciarGrabacion() {

    if (!port || !port.readable) {
        mostrarNotificacion('Primero debes conectar el puerto serial', 'error');
        return;
    }

    if (estaGrabando) {
        mostrarNotificacion('Ya se está grabando', 'info');
        return;
    }

    //  inicializar tiempos
    tiempoInicio = Date.now();
    tiempoInicioGrabacion = tiempoInicio;
    tiempoActual = 0;

    // Iniciar grabación
    estaGrabando = true;
    datosGrabados = []; // Limpiar datos anteriores
    startTime = Date.now();

    // Limpiar la tabla para comenzar nueva grabación
    document.querySelector('#tablaDatos tbody').innerHTML = '';
    datos = []; // También limpiar datos históricos
    contadorLecturas = 0;
    ultimaLecturaTiempo = 0; // Reiniciamos el rastreador de intervalos

    // Actualizar interfaz
    actualizarControlesGrabacion();

    // Mostrar notificación
    mostrarNotificacion('Grabación iniciada. Los datos se mostrarán en la tabla.', 'success');
    console.log('Grabación iniciada');
}

// === FUNCIÓN PARA DETENER GRABACIÓN ===
function detenerGrabacion() {
    if (!estaGrabando) {
        mostrarNotificacion('No hay grabación activa', 'info');
        return;
    }

    // Detener grabación
    estaGrabando = false;
    const tiempoFinGrabacion = Date.now();
    const duracion = ((tiempoFinGrabacion - tiempoInicioGrabacion) / 1000).toFixed(2);

    // Actualizar interfaz
    actualizarControlesGrabacion();

    // Mostrar resumen
    mostrarNotificacion(`Grabación detenida: ${datosGrabados.length} lecturas en ${duracion} segundos`, 'success');
    console.log(`Grabación detenida: ${datosGrabados.length} lecturas`);

    // Actualizar gráfica con los datos grabados
    actualizarGrafica();
}

// === FUNCIÓN PARA ALTERNAR GRABACIÓN ===
function alternarGrabacion() {
    if (estaGrabando) {
        detenerGrabacion();
    } else {
        iniciarGrabacion();
    }
}

// === FUNCIÓN PARA ACTUALIZAR LA GRÁFICA (optimizada para muchos datos) ===
function actualizarGrafica() {
    console.log("Actualizando gráfica...");

    const tiempos = [];
    const deformaciones1 = [];
    const deformaciones2 = [];
    const deformacionesPromedio = [];

    // Leer datos de la tabla (en orden inverso porque usamos prepend)
    const filas = Array.from(document.querySelectorAll('#tablaDatos tbody tr'));
    const totalFilas = filas.length;

    // Si hay muchos datos, limitar los puntos en la gráfica para mejor rendimiento
    const maxPuntosGrafica = 200; // Máximo de puntos a mostrar en la gráfica

    // Calcular el salto para muestrear los datos si hay muchos datos
    const salto = totalFilas > maxPuntosGrafica ? Math.ceil(totalFilas / maxPuntosGrafica) : 1;

    console.log(`Total de filas: ${totalFilas}, Salto de muestreo: ${salto} `);

    // Ordenar de más antiguo a más nuevo para la gráfica
    // (las filas están en orden inverso porque usamos prepend)
    let contador = 0;

    // Recorrer las filas en orden normal (de más antiguo a más nuevo)
    for (let i = filas.length - 1; i >= 0; i--) {
        const fila = filas[i];

        // Muestrear si hay muchos datos
        if (contador % salto === 0 || totalFilas <= maxPuntosGrafica) {
            const tiempo = parseFloat(fila.children[0].innerText);
            const d1 = parseFloat(fila.querySelector('.lvdt1').innerText);
            const d2 = parseFloat(fila.querySelector('.lvdt2').innerText);

            if (!isNaN(tiempo) && !isNaN(d1) && !isNaN(d2)) {
                tiempos.push(tiempo);
                deformaciones1.push(d1);
                deformaciones2.push(d2);
                deformacionesPromedio.push(parseFloat(truncar5Decimales((d1 + d2) / 2)));
            }
        }
        contador++;
    }

    const ctx = document.getElementById('graficaDeformaciones').getContext('2d');

    // Eliminar gráfico anterior si existe
    if (miGrafica) {
        miGrafica.destroy();
    }

    // Crear nueva gráfica optimizada
    miGrafica = new Chart(ctx, {
        type: 'line',
        data: {
            labels: tiempos,
            datasets: [
                {
                    label: 'LVDT1',
                    data: deformaciones1,
                    borderColor: 'rgb(37, 99, 235)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: totalFilas > 50 ? 1 : 2, // Puntos más pequeños si hay muchos datos
                    pointHoverRadius: totalFilas > 50 ? 3 : 4
                },
                {
                    label: 'LVDT2',
                    data: deformaciones2,
                    borderColor: 'rgb(5, 150, 105)',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: totalFilas > 50 ? 1 : 2,
                    pointHoverRadius: totalFilas > 50 ? 3 : 4
                },
                {
                    label: 'Promedio',
                    data: deformacionesPromedio,
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: totalFilas > 50 ? 2 : 4,
                    pointHoverRadius: totalFilas > 50 ? 4 : 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Deformaciones LVDT1, LVDT2 y Promedio(${totalFilas} lecturas)`,
                    font: { size: 16, weight: 'bold' },
                    color: '#1e3a8a'
                },
                legend: {
                    position: 'top',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y != null) {
                                label += truncar5Decimales(context.parsed.y) + ' mm';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Tiempo (seg)',
                        font: { weight: 'bold', size: 12 }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        maxTicksLimit: 20 // Limitar número de etiquetas en el eje X
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Deformación (mm)',
                        font: { weight: 'bold', size: 12 }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    beginAtZero: true
                }
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
            },
            animation: {
                duration: totalFilas > 100 ? 0 : 500, // Sin animación si hay muchos datos
                easing: 'easeOutQuart'
            },
            elements: {
                line: {
                    tension: totalFilas > 100 ? 0 : 0.4 // Líneas rectas si hay muchos datos
                }
            }
        }
    });

    console.log(`Gráfica actualizada con ${tiempos.length} puntos(de ${totalFilas} lecturas)`);
}

// Función para insertar una fila en la tabla y actualizar la gráfica
function agregarFilaYActualizar(lectura) {

    const tbody = document.querySelector('#tablaDatos tbody');
    const Lvdt1 = parseFloat(lectura.Lvdt1);
    const Lvdt2 = parseFloat(lectura.Lvdt2);
    const promedio = ((Lvdt1 + Lvdt2) / 2);

    // CÁLCULO DEL TIEMPO EN SEGUNDOS 
    let tiempoSegundos = 0;

    if (tiempoInicioGrabacion !== null) {
        // Durante grabación → tiempo desde que inició la grabación
        tiempoSegundos = Math.floor(
            (Date.now() - tiempoInicioGrabacion) / 1000
        );
    } else {
        // Antes de grabar → tiempo desde que se conectó
        tiempoSegundos = Math.floor(
            (Date.now() - startTime) / 1000
        );
    }

    const fila = document.createElement('tr');
    fila.className = 'hover:bg-blue-50 transition-colors duration-150';
    fila.innerHTML = `
                <td class="px-4 py-2 text-center text-sm font-medium text-gray-900 border-b border-gray-200">
                    ${tiempoSegundos} 
        </td>
        <td class="px-4 py-2 text-center border-b border-gray-200">
            <div contenteditable="true" 
                 class="editable lvdt1 w-full px-2 py-1 border border-transparent hover:border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                 data-original="${Lvdt1}">
                ${truncar5Decimales(lectura.Lvdt1)}
            </div>
        </td>
        <td class="px-4 py-2 text-center border-b border-gray-200">
            <div contenteditable="true" 
                 class="editable lvdt2 w-full px-2 py-1 border border-transparent hover:border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                 data-original="${Lvdt2}">
                ${truncar5Decimales(lectura.Lvdt2)}
            </div>
        </td>
        <td class="px-4 py-2 text-center text-sm font-semibold text-gray-900 promedio border-b border-gray-200">
            ${truncar5Decimales(promedio)}
        </td>
            `;
    // Añadir al inicio para que el dato más nuevo esté arriba
    tbody.prepend(fila);

    // Si estamos grabando, guardar el dato
    if (estaGrabando) {
        mostrarNotificacion(
            `Sensor 1: ${truncar5Decimales(lectura.Lvdt1)} mm | ` +
            `Sensor 2: ${truncar5Decimales(lectura.Lvdt2)} mm | ` +
            `Promedio: ${truncar5Decimales(promedio)} mm`,
            'info'
        );

    }

    actualizarGrafica(); // Llamada automática a la gráfica
}

// === FUNCIÓN PARA PROCESAR UNA LÍNEA DEL SERIAL ===
function procesarLineaSerial(linea) {
    let lineaProcesada = linea.trim();

    console.log(`Procesando línea: "${lineaProcesada}"`);

    // Intentar parsear como JSON
    try {
        // Verificar si es un objeto JSON válido
        if (lineaProcesada.startsWith('{') && lineaProcesada.endsWith('}')) {
            const datosJSON = JSON.parse(lineaProcesada);

            // Verificar que tenga las propiedades correctas
            if (datosJSON.hasOwnProperty('ID1') && datosJSON.hasOwnProperty('ID2')) {
                contadorLecturas++;
                const id = contadorLecturas; // Usamos el contador como ID
                const Lvdt1 = parseFloat(datosJSON.ID1);
                const Lvdt2 = parseFloat(datosJSON.ID2);

                // Validar que los datos sean números
                if (!isNaN(Lvdt1) && !isNaN(Lvdt2)) {
                    return {
                        id,
                        Lvdt1: Lvdt1.toFixed(6),
                        Lvdt2: Lvdt2.toFixed(6),
                        timestamp: Date.now() // Usar tiempo absoluto, no relativo
                    };
                } else {
                    console.warn('Datos JSON inválidos (no son números):', lineaProcesada);
                    return null;
                }
            } else {
                console.warn('Formato JSON incorrecto (faltan propiedades):', lineaProcesada);
                return null;
            }
        } else {
            // Si no es JSON, intentar el formato antiguo por compatibilidad
            const parts = lineaProcesada.split(/\s+/);

            if (parts.length >= 3) {
                const id = parseInt(parts[0]);
                const Lvdt1 = parseFloat(parts[1]);
                const Lvdt2 = parseFloat(parts[2]);

                // Validar que los datos sean números
                if (!isNaN(id) && !isNaN(Lvdt1) && !isNaN(Lvdt2)) {
                    return {
                        id,
                        Lvdt1: Lvdt1.toFixed(6),
                        Lvdt2: Lvdt2.toFixed(6),
                        timestamp: Date.now() // Usar tiempo absoluto, no relativo
                    };
                } else {
                    console.warn('Datos inválidos en línea procesada:', lineaProcesada);
                    return null;
                }
            } else {
                console.warn('Formato incorrecto en línea procesada:', lineaProcesada);
                return null;
            }
        }
    } catch (error) {
        console.warn('Error al parsear JSON:', error, 'Línea:', lineaProcesada);
        return null;
    }
}

// === FUNCIÓN PARA LISTAR PUERTOS DISPONIBLES ===
async function listarPuertosDisponibles() {
    try {
        // Solicitar puertos sin conectar automáticamente
        const ports = await navigator.serial.getPorts();
        availablePorts = ports;

        // Actualizar el modal con los puertos encontrados
        actualizarSelectorPuertos();

        return ports;
    } catch (err) {
        console.error('Error al listar puertos:', err);
        return [];
    }
}

// === FUNCIÓN PARA ACTUALIZAR EL SELECTOR DE PUERTOS ===
function actualizarSelectorPuertos() {
    const selector = document.getElementById('portSelector');
    if (!selector) return;

    selector.innerHTML = '';

    if (availablePorts.length === 0) {
        selector.innerHTML = `
                <div class="text-center py-6">
        <div class="relative mx-auto w-16 h-16 mb-3">
            <!-- Laptop desconectada -->
            <svg class="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            <!-- Cable desconectado -->
            <svg class="absolute -bottom-2 -right-2 w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <!-- Signo de advertencia -->
            <svg class="absolute top-0 right-0 w-6 h-6 text-yellow-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.226 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
        </div>
        <h4 class="font-medium text-gray-900 mb-1">No se detectaron puertos seriales</h4>
        <p class="text-sm text-gray-500 mb-3">Conecta tu ESP32 al puerto USB de la computadora</p>
        <div class="bg-blue-50 border border-blue-100 rounded-lg p-3 text-left">
            <p class="text-xs font-medium text-blue-800 mb-1">Sigue estos pasos:</p>
            <ol class="text-xs text-blue-700 space-y-1">
                <li class="flex items-start">
                    <span class="mr-1">1.</span>
                    Conecta el cable USB del ESP32 a la computadora
                </li>
                <li class="flex items-start">
                    <span class="mr-1">2.</span>
                    Espera a que el sistema detecte el dispositivo
                </li>
                <li class="flex items-start">
                    <span class="mr-1">3.</span>
                    Haz clic en "Actualizar lista" para ver los puertos
                </li>
            </ol>
        </div>
    </div>
                `;
        return;
    }

    // Crear lista de puertos
    availablePorts.forEach((port, index) => {
        const portItem = document.createElement('div');
        portItem.className = 'port-item cursor-pointer p-4 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors';
        portItem.innerHTML = `
                <div class="flex items-center justify-between">
        <div class="flex items-center">
            <div class="bg-gradient-to-br from-green-100 to-blue-50 p-2 rounded-lg mr-3 border border-green-200">
                <div class="relative">
                    <!-- Laptop conectada -->
                    <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    <!-- Chip ESP32 conectado -->
                    <svg class="absolute -bottom-1 -right-1 w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
                    </svg>
                </div>
            </div>
            <div>
                <h4 class="font-medium text-gray-900">Puerto Serial ${index + 1}</h4>
                <p class="text-xs text-gray-500">ESP32 conectado vía USB</p>
            </div>
        </div>
        <div class="flex items-center">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                Disponible
            </span>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
        </div>
    </div>
                `;

        portItem.addEventListener('click', () => {
            seleccionarPuerto(port, index);
        });

        selector.appendChild(portItem);
    });
}

// === FUNCIÓN PARA SELECCIONAR UN PUERTO ===
async function seleccionarPuerto(selectedPort, index) {
    try {
        const modalPuerto = bootstrap.Modal.getInstance(document.getElementById('modalPuerto'));
        if (modalPuerto) {
            modalPuerto.hide();
        }

        // Mostrar estado "conectando"
        actualizarEstadoConexion('conectando', `Conectando al Puerto Serial ${index + 1}...`);

        // Mostrar indicador de conexión en el botón
        document.getElementById('btnDatos').innerHTML = `
                <span class="flex items-center justify-center">
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                Conectando...
            </span>
                `;
        document.getElementById('btnDatos').disabled = true;



        // Esperar un momento para mostrar la animación
        await new Promise(resolve => setTimeout(resolve, 500));

        // Conectar al puerto seleccionado
        port = selectedPort;
        await conectarAlPuerto();

    } catch (err) {
        console.error('Error al seleccionar puerto:', err);
        mostrarErrorConexion(err.message);
        actualizarEstadoConexion('error', err.message);
    }
}

// === FUNCIÓN PARA CONECTAR AL PUERTO YA SELECCIONADO ===
async function conectarAlPuerto() {
    try {
        // Abrir el puerto
        await port.open({
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none',
            bufferSize: 10000
        });

        console.log('Puerto serial conectado correctamente');

        // Actualizar estado
        actualizarEstadoConexion('conectado', 'Conexión establecida con el ESP32');

        // Actualizar interfaz del botón
        document.getElementById('btnDatos').innerHTML = `
                <span class="flex items-center justify-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
            Desconectar
            </span>
                `;
        document.getElementById('btnDatos').classList.remove('border-purple-600', 'text-purple-600', 'hover:bg-purple-50');
        document.getElementById('btnDatos').classList.add('bg-red-600', 'hover:bg-red-700', 'text-white');
        document.getElementById('btnDatos').disabled = false;

        // Mostrar notificación de éxito
        mostrarNotificacion('Conexión establecida con el puerto serial', 'success');

        // Mostrar botón de grabación (eliminando la clase 'hidden')
        document.getElementById('btnGrabar').classList.remove('hidden');

        // Resetear estado de grabación
        estaGrabando = false;
        datosGrabados = [];
        tiempoInicioGrabacion = null;

        // Configurar estado inicial de los botones de grabación
        actualizarControlesGrabacion();

        // Actualizar estado de conexión
        actualizarEstadoConexion('conectado', 'Conectado. Haz clic en "Iniciar Grabación" para comenzar');

        // Limpiar datos anteriores
        document.querySelector('#tablaDatos tbody').innerHTML = '';
        datos = [];
        buffer = '';
        contadorLecturas = 0;
        startTime = Date.now();
        ultimaLecturaTiempo = 0;

        // Iniciar lectura
        readLoop();

    } catch (err) {
        console.error('Error al conectar:', err);
        mostrarErrorConexion(err.message);
        actualizarEstadoConexion('error', `Error: ${err.message} `);
        port = null;
        resetearBotonConexion();
    }
}

// === FUNCIÓN PARA MOSTRAR ERROR DE CONEXIÓN ===
function mostrarErrorConexion(mensaje) {
    document.getElementById('btnDatos').innerHTML = `
                <span class="flex items-center justify-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.226 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
            Conectar a ESP32
        </span>
                `;
    document.getElementById('btnDatos').disabled = false;

    // Mostrar modal de error
    const modalError = new bootstrap.Modal(document.getElementById('modalError'));
    document.getElementById('errorMensaje').textContent = mensaje;
    modalError.show();
}

// === FUNCIÓN PARA MOSTRAR NOTIFICACIÓN ===
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.createElement('div');
    notificacion.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-0 ${tipo === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
        tipo === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
            'bg-blue-50 border border-blue-200 text-blue-800'
        }`;
    notificacion.innerHTML = `
        <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="${tipo === 'success' ? 'M5 13l4 4L19 7' :
            tipo === 'error' ? 'M6 18L18 6M6 6l12 12' :
                'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}" />
            </svg>
            <span class="font-medium">${mensaje}</span>
        </div>
    `;

    document.body.appendChild(notificacion);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        notificacion.style.transform = 'translateX(100%)';
        setTimeout(() => notificacion.remove(), 300);
    }, 3000);
}

// === FUNCIÓN PARA ACTUALIZAR ESTADO DE CONEXIÓN ===
function actualizarEstadoConexion(estado, detalles = '') {
    const estadoEl = document.getElementById('estadoConexion');
    const ledEstado = document.getElementById('ledEstado');
    const ledBrillo = document.getElementById('ledBrillo');
    const estadoDetalle = document.getElementById('estadoDetalle');

    if (!estadoEl || !ledEstado || !ledBrillo) return;

    // Remover todas las clases de estado anteriores
    ledEstado.classList.remove('led-desconectado', 'led-conectado', 'led-conectando',
        'bg-gray-400', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500');
    ledBrillo.classList.remove('bg-gray-400', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500',
        'animate-pulse', 'animate-blink');

    // Aplicar clases según el estado
    switch (estado) {
        case 'conectado':
            estadoEl.textContent = 'Conectado';
            estadoEl.className = 'text-sm font-medium text-green-600';
            ledEstado.classList.add('bg-green-500', 'led-conectado');
            ledBrillo.classList.add('bg-green-500', 'animate-pulse');
            estadoDetalle.textContent = detalles || 'Recibiendo datos del ESP32...';
            estadoDetalle.className = 'text-xs text-green-500 mt-1';
            break;

        case 'desconectado':
            estadoEl.textContent = 'Desconectado';
            estadoEl.className = 'text-sm font-medium text-gray-500';
            ledEstado.classList.add('bg-gray-400', 'led-desconectado');
            ledBrillo.classList.add('bg-gray-400');
            estadoDetalle.textContent = detalles || 'Esperando conexión...';
            estadoDetalle.className = 'text-xs text-gray-400 mt-1';
            break;

        case 'conectando':
            estadoEl.textContent = 'Conectando...';
            estadoEl.className = 'text-sm font-medium text-blue-600';
            ledEstado.classList.add('bg-blue-500', 'led-conectando');
            ledBrillo.classList.add('bg-blue-500', 'animate-blink');
            estadoDetalle.textContent = detalles || 'Estableciendo conexión...';
            estadoDetalle.className = 'text-xs text-blue-500 mt-1';
            break;

        case 'error':
            estadoEl.textContent = 'Error';
            estadoEl.className = 'text-sm font-medium text-red-600';
            ledEstado.classList.add('bg-red-500', 'led-desconectado');
            ledBrillo.classList.add('bg-red-500', 'animate-pulse');
            estadoDetalle.textContent = detalles || 'Error en la conexión';
            estadoDetalle.className = 'text-xs text-red-500 mt-1';
            break;

        case 'leyendo':
            estadoEl.textContent = 'Leyendo datos';
            estadoEl.className = 'text-sm font-medium text-green-600';
            ledEstado.classList.add('bg-green-500', 'led-conectado');
            ledBrillo.classList.add('bg-green-500', 'animate-blink');
            estadoDetalle.textContent = detalles || 'Transfiriendo datos en tiempo real';
            estadoDetalle.className = 'text-xs text-green-500 mt-1';
            break;
    }

    // Si hay detalles específicos, mostrarlos
    if (detalles && estadoDetalle) {
        estadoDetalle.textContent = detalles;
    }
}

// === FUNCIÓN PARA RESETEAR BOTÓN DE CONEXIÓN ===
function resetearBotonConexion() {
    document.getElementById('btnDatos').innerHTML = `
                <span class="flex items-center justify-center">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
            Conectar a ESP32
        </span >
                `;
    document.getElementById('btnDatos').classList.remove('bg-red-600', 'hover:bg-red-700', 'text-white');
    document.getElementById('btnDatos').classList.add('border-purple-600', 'text-purple-600', 'hover:bg-purple-50');
    document.getElementById('btnDatos').disabled = false;

    // Ocultar botón de grabación
    document.getElementById('btnGrabar').classList.add('hidden');

    // Resetear estado de grabación
    estaGrabando = false;
    datosGrabados = [];
    tiempoInicioGrabacion = null;

    // Configurar estado inicial de los botones de grabación
    actualizarControlesGrabacion();

    actualizarEstadoConexion('desconectado', 'Haz clic en "Conectar a ESP32" para iniciar');
}

// === FUNCIÓN PARA CONECTAR AL PUERTO SERIAL ===
async function connectSerial() {
    try {
        if (!navigator.serial) {
            mostrarErrorConexion(
                'Web Serial API no soportada. Usa Chrome o Edge.'
            );
            return;
        }

        const modalEl = document.getElementById('modalPuerto');
        const modalPuerto = modalEl
            ? bootstrap.Modal.getOrCreateInstance(modalEl)
            : null;

        // Si ya hay conexión → mostrar modal de puertos
        if (port && port.readable) {
            modalPuerto?.show();
            return;
        }

        // 🔹 Pedir permiso al navegador
        await navigator.serial.requestPort();
        await listarPuertosDisponibles();
        modalPuerto?.show();


        // 🔹 Mostrar modal SOLO si existe
        modalPuerto?.show();

    } catch (err) {
        console.error('Error conexión serial:', err);

        if (err.name !== 'NotFoundError') {
            mostrarErrorConexion(
                'No se pudo establecer conexión con el ESP32'
            );
        }
    }
}


// === FUNCIÓN DESCONECTAR ===
async function disconnectSerial() {
    console.log("Iniciando desconexión...");
    keepReading = false;

    // Resetear estado de grabación
    estaGrabando = false;
    datosGrabados = [];
    tiempoInicioGrabacion = null;

    // Configurar estado inicial de los botones de grabación
    actualizarControlesGrabacion();

    estaGrabando = false; // Detener cualquier grabación activa

    try {
        if (reader) {
            console.log("Cancelando reader...");
            await reader.cancel();
            reader.releaseLock();
            reader = null;
        }
    } catch (err) {
        console.warn('Error al cancelar reader:', err);
    }

    try {
        if (port) {
            console.log("Cerrando puerto...");
            await port.close();
            port = null;
        }
    } catch (err) {
        console.warn('Error al cerrar puerto:', err);
    }

    console.log('Desconectado correctamente');

    // Actualizar interfaz
    resetearBotonConexion();

    // Mostrar notificación
    mostrarNotificacion('Desconectado del puerto serial', 'info');

    // Mostrar estadísticas
    if (startTime) {
        console.log(`Lecturas recibidas: ${contadorLecturas} `);
        console.log(`Tiempo total: ${((Date.now() - startTime) / 1000).toFixed(2)} segundos`);
    }
}

// === BUCLE DE LECTURA ===
async function readLoop() {
    if (!port || !port.readable) {
        console.error("Puerto no disponible para lectura");
        actualizarEstadoConexion('error', 'Puerto no disponible para lectura');
        return;
    }

    const decoder = new TextDecoder('utf-8');
    keepReading = true;
    buffer = '';
    contadorLecturas = 0;
    startTime = Date.now();

    try {
        reader = port.readable.getReader();
        console.log("Iniciando bucle de lectura con control de grabación...");

        actualizarEstadoConexion('conectado', 'Listo para grabar datos...');

        while (keepReading) {
            try {
                const { value, done } = await reader.read();

                if (done) {
                    console.log("Stream de lectura finalizado");
                    break;
                }

                if (value) {
                    if (estaGrabando) {
                        actualizarEstadoConexion(
                            'leyendo',
                            `Grabando... Lecturas: ${datosGrabados.length}`
                        );
                    } else {
                        actualizarEstadoConexion(
                            'conectado',
                            `Conectado. Lecturas recibidas: ${contadorLecturas}`
                        );
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;

                        console.log(`Lectura recibida: "${line}"`);
                        const lecturaProcesada = procesarLineaSerial(line);

                        if (lecturaProcesada) {
                            datos.push(lecturaProcesada);


                            const tiempoActual = tiempoInicioGrabacion
                                ? Date.now() - tiempoInicioGrabacion
                                : Date.now() - startTime;

                            if (estaGrabando) {
                                // 🔴 DURANTE GRABACIÓN → mostrar SIEMPRE
                                agregarFilaYActualizar(lecturaProcesada);

                                // Guardar datos grabados
                                datosGrabados.push({
                                    ...lecturaProcesada,
                                    tiempo: (Date.now() - tiempoInicioGrabacion) / 1000
                                });

                            } else {
                                // 🟡 SOLO cuando NO está grabando → usar intervalo
                                if (tiempoActual >= ultimaLecturaTiempo + intervaloMuestreo) {
                                    agregarFilaYActualizar(lecturaProcesada);
                                    ultimaLecturaTiempo = tiempoActual;
                                }
                            }
                        }
                    }
                }
            } catch (readError) {
                console.error('Error en lectura de chunk:', readError);
                if (!keepReading) break;
            }
        }
    } catch (err) {
        console.error('Error crítico en readLoop:', err);
        actualizarEstadoConexion('error', `Error de lectura: ${err.message}`);
    } finally {
        if (reader) {
            try {
                reader.releaseLock();
            } catch (e) {
                console.warn('Error al liberar lock del reader:', e);
            }
            reader = null;
        }

        if (keepReading) {
            console.log("Bucle terminó inesperadamente, desconectando...");
            await disconnectSerial();
        }
    }
}

// === FUNCIÓN PARA MOSTRAR AYUDA ===
function mostrarAyuda() {
    // Verificar si ya existe el modal de ayuda
    let modalAyudaEl = document.getElementById('modalAyuda');

    if (!modalAyudaEl) {
        // Crear modal de ayuda dinámicamente
        modalAyudaEl = document.createElement('div');
        modalAyudaEl.className = 'modal fade';
        modalAyudaEl.id = 'modalAyuda';
        modalAyudaEl.setAttribute('tabindex', '-1');
        modalAyudaEl.setAttribute('aria-labelledby', 'modalAyudaLabel');
        modalAyudaEl.setAttribute('aria-hidden', 'true');
        modalAyudaEl.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content rounded-xl overflow-hidden">
                        <div class="modal-header bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4">
                            <h5 class="modal-title text-lg font-semibold" id="modalAyudaLabel">Guía de Conexión</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                        </div>
                        <div class="modal-body p-6">
                            <div class="space-y-4">
                                <div class="border-l-4 border-blue-500 pl-4">
                                    <h6 class="font-bold text-gray-800">1. Conectar el ESP32</h6>
                                    <p class="text-sm text-gray-600">Conecta tu ESP32 al puerto USB de la computadora</p>
                                </div>
                                <div class="border-l-4 border-blue-500 pl-4">
                                    <h6 class="font-bold text-gray-800">2. Seleccionar Puerto</h6>
                                    <p class="text-sm text-gray-600">Haz clic en "Conectar a ESP32" y selecciona el puerto correcto</p>
                                </div>
                                <div class="border-l-4 border-blue-500 pl-4">
                                    <h6 class="font-bold text-gray-800">3. Configurar Intervalo</h6>
                                    <p class="text-sm text-gray-600">Define cada cuántos segundos quieres tomar lecturas</p>
                                </div>

                                                <!-- Paso 4 -->
                                <div class="border-l-4 border-blue-500 pl-4">
                                    <h6 class="font-bold text-gray-800">4. Iniciar Grabación de Datos</h6>
                                    <p class="text-sm text-gray-600 mt-2 ml-11">
                                        Una vez conectado, aparecerá el botón <span class="font-semibold text-green-600">"Iniciar Grabación"</span>. Haz clic en él para comenzar a capturar datos.
                                    </p> <br>

                                <div class="bg-blue-50 p-4 rounded-lg">
                                    <h6 class="font-bold text-blue-800">📊 Visualización en Tiempo Real</h6>
                                    <p class="text-sm text-blue-700">Los datos se mostrarán automáticamente en la tabla y gráfica</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer p-4 bg-gray-50">
                            <button type="button"
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 font-medium"
                                data-bs-dismiss="modal">
                                Entendido
                            </button>
                        </div>
                    </div>
            </div>
                `;
        document.body.appendChild(modalAyudaEl);
    }

    // Mostrar el modal
    const modalAyuda = new bootstrap.Modal(modalAyudaEl);
    modalAyuda.show();
}

// Manejar cierre de página o recarga (importante!)
window.addEventListener('beforeunload', async () => {
    if (port && port.readable) {
        await disconnectSerial();
    }
});

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM cargado, inicializando...");

    // Inicializar estado de conexión
    actualizarEstadoConexion('desconectado', 'Conecta el ESP32 y haz clic en "Conectar Puerto Serial"');

    // === CONFIGURACIÓN DEL MODAL DE TIEMPO ===
    const modalTiempoEl = document.getElementById('modalTiempo');
    const modalTiempo = new bootstrap.Modal(modalTiempoEl);

    // Al enviar el formulario de tiempo
    document.getElementById('formTiempo').addEventListener('submit', function (event) {
        event.preventDefault();

        const nuevoSalto = parseInt(document.getElementById('salto').value);

        if (nuevoSalto <= 0) {
            alert('El intervalo debe ser mayor a 0.');
            return;
        }

        // Actualiza la variable de control de muestreo (convertir a milisegundos)
        intervaloMuestreo = nuevoSalto * 1000;
        ultimaLecturaTiempo = 0; // Reiniciar para aplicar nuevo intervalo

        // Limpiar tabla si ya está conectado
        if (port && port.readable) {

        }

        modalTiempo.hide();
        mostrarNotificacion(`Intervalo de muestreo configurado a ${nuevoSalto} segundos`, 'success');
    });

    // === VALIDAR ENTRADA Y CALCULAR PROMEDIO ===
    document.addEventListener('input', function (e) {
        if (e.target.classList.contains('editable')) {
            const valor = e.target.innerText.trim();
            const elemento = e.target;

            // Validar que sea un número válido
            if (!/^-?\d*\.?\d*$/.test(valor)) {
                const original = elemento.getAttribute('data-original');
                elemento.innerText = truncar5Decimales(original);
                return;
            }

            // Actualizar el valor original
            elemento.setAttribute('data-original', valor);

            // Recalcular promedio
            const fila = elemento.closest('tr');
            const celdaLVDT1 = fila.querySelector('.lvdt1');
            const celdaLVDT2 = fila.querySelector('.lvdt2');
            const celdaPromedio = fila.querySelector('.promedio');

            const val1 = parseFloat(celdaLVDT1.innerText.trim());
            const val2 = parseFloat(celdaLVDT2.innerText.trim());

            if (!isNaN(val1) && !isNaN(val2)) {
                const promedio = ((val1 + val2) / 2);
                celdaPromedio.innerText = truncar5Decimales(promedio);
            } else {
                celdaPromedio.innerText = '';
            }

            // Actualizar gráfica
            actualizarGrafica();
        }
    });

    // Botón para actualizar gráfica manualmente
    document.getElementById('btnGraficar').addEventListener('click', function () {
        actualizarGrafica();
        mostrarNotificacion('Gráfica actualizada', 'success');
    });

    // === PREPARAR DATOS PARA REDIRECCIÓN ===
    function prepararDatosParaRedireccion() {
        const datosExportar = [];
        const filas = Array.from(document.querySelectorAll('#tablaDatos tbody tr'));

        // Ordenar de más antiguo a más nuevo
        filas.reverse().forEach(fila => {
            const tiempo = fila.children[0].innerText.trim();
            const promedio = fila.children[3].innerText.trim();

            if (tiempo && promedio) {
                datosExportar.push({
                    tiempo,
                    promedio,
                    Lvdt1: fila.querySelector('.lvdt1').innerText.trim(),
                    Lvdt2: fila.querySelector('.lvdt2').innerText.trim()
                });
            }
        });

        return datosExportar;
    }

    // Eventos para los formatos de ensayo
    document.getElementById('formatoCilindros').addEventListener('click', function (e) {
        e.preventDefault();
        const datosExportar = prepararDatosParaRedireccion();
        if (datosExportar.length > 0) {
            localStorage.setItem('datosDeformaciones', JSON.stringify(datosExportar));
            localStorage.setItem('formatoSeleccionado', 'cilindros');
            window.location.href = "cilindros.html";
        } else {
            mostrarErrorConexion('No hay datos para exportar. Primero inicie la conexión y tome lecturas.');
        }
    });

    document.getElementById('formatoMuretes').addEventListener('click', function (e) {
        e.preventDefault();
        const datosExportar = prepararDatosParaRedireccion();
        if (datosExportar.length > 0) {
            localStorage.setItem('datosDeformaciones', JSON.stringify(datosExportar));
            localStorage.setItem('formatoSeleccionado', 'muretes');
            window.location.href = "muretes.html";
        } else {
            mostrarErrorConexion('No hay datos para exportar. Primero inicie la conexión y tome lecturas.');
        }
    });

    document.getElementById('formatoPilas').addEventListener('click', function (e) {
        e.preventDefault();
        const datosExportar = prepararDatosParaRedireccion();
        if (datosExportar.length > 0) {
            localStorage.setItem('datosDeformaciones', JSON.stringify(datosExportar));
            localStorage.setItem('formatoSeleccionado', 'pilas');
            window.location.href = "pilas.html";
        } else {
            mostrarErrorConexion('No hay datos para exportar. Primero inicie la conexión y tome lecturas.');
        }
    });

    // === BOTÓN DE CONEXIÓN SERIAL ===
    document.getElementById("btnDatos").addEventListener("click", async function () {
        if (port && port.readable) {
            await disconnectSerial();
        } else {
            await connectSerial();
        }
    });


    // Configurar el botón de ayuda flotante
    document.getElementById('btnAyuda')?.addEventListener('click', mostrarAyuda);

    // Inicializar gráfica vacía
    setTimeout(() => {
        actualizarGrafica();
    }, 500);

    // Inicializar estado de conexión
    actualizarEstadoConexion('desconectado');

    console.log("Inicialización completada");

    // Botón de grabación
    document.getElementById('btnGrabar').addEventListener('click', alternarGrabacion);

});