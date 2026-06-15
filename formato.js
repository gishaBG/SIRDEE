// ===== CONTROL DE GRÁFICA =====
let graficarHabilitado = false;

// Simulador de datos de carga desde puerto serial
class SimuladorDatosCarga {
    constructor() {
        this.datosCargaSimulados = [];
        this.inicializarDatosCarga();
    }

    inicializarDatosCarga() {
        // Generar datos de carga de ejemplo
        for (let i = 0; i <= 100; i++) {
            // Simular curva de carga típica
            const carga = (i === 0)
                ? 0
                : Math.min(10000, Math.pow(i * 10, 1.5) + Math.random() * 500);

            this.datosCargaSimulados.push({
                id: i,
                peso_enviado: Math.round(carga)
            });
        }
    }

    // Simular lectura desde puerto serial
    async obtenerDatosCarga() {
        console.log("Simulando lectura de datos de carga desde puerto serial...");
        return this.datosCargaSimulados;
    }
}

// FUNCIÓN PARA CALCULAR PROMEDIO EN MM (CILINDROS Y MURETES)
function calcularLongitudPromedioMM() {
    const input1 = document.getElementById('longitud1');
    const input2 = document.getElementById('longitud2');
    const promedioInput = document.getElementById('longitudPromedio');

    if (!input1 || !input2 || !promedioInput) {
        return;
    }

    const l1 = parseFloat(input1.value);
    const l2 = parseFloat(input2.value);

    if (!isNaN(l1) && !isNaN(l2)) {
        const promedioCM = (l1 + l2) / 2;
        const promedioMM = promedioCM * 10;
        promedioInput.value = promedioMM.toFixed(3);

        // Recalcular deformación unitaria (ε) en cada fila
        const filas = document.querySelectorAll('#tablaDatos tbody tr');
        filas.forEach(fila => {
            const deformacionPromedio = parseFloat(fila.children[1].innerText.trim());
            const celdaDeformacion = fila.children[2];
            celdaDeformacion.innerText = (!isNaN(deformacionPromedio) && promedioMM !== 0)
                ? (deformacionPromedio / promedioMM).toFixed(6)
                : '';
        });

        actualizarGrafica();
    } else {
        promedioInput.value = '';

        const filas = document.querySelectorAll('#tablaDatos tbody tr');
        filas.forEach(fila => {
            fila.children[2].innerText = '';
        });
    }

    actualizarGrafica();
}

// FUNCIÓN PARA CALCULAR PROMEDIO EN MM (PILAS)
function calcularPromedioLongitudMM() {
    const idsLongitudes = ['long1Lado1', 'long1Lado2', 'long2Lado1', 'long2Lado2', 'long3Lado1', 'long3Lado2'];
    const longitudes = idsLongitudes.map(id => {
        const element = document.getElementById(id);
        return element ? parseFloat(element.value) : NaN;
    });

    const promedioInput = document.getElementById('promedioLongitud');
    const filas = document.querySelectorAll('#tablaDatos tbody tr');

    // Filtrar solo válidos
    const validos = longitudes.filter(v => !isNaN(v));

    if (validos.length > 0) {
        const promedioCM = validos.reduce((a, b) => a + b, 0) / validos.length;
        const promedioMM = promedioCM * 10;
        promedioInput.value = promedioMM.toFixed(2);

        // Calcular deformación unitaria
        filas.forEach(fila => {
            const deformacionPromedio = parseFloat(fila.children[1].innerText.trim());
            fila.children[2].innerText = (!isNaN(deformacionPromedio) && promedioMM !== 0)
                ? (deformacionPromedio / promedioMM).toFixed(6)
                : '';
        });

    } else {
        promedioInput.value = '';
        // Limpiar la columna de Deformación Unitaria si no hay promedio válido
        filas.forEach(fila => {
            fila.children[2].innerText = '';
        });
    }

    actualizarGrafica();
}

// CILINDROS FUNCIÓN PARA CALCULAR ÁREA AUTOMÁTICA DESDE DIÁMETRO
function calcularAreaCilindro() {
    const diametro = parseFloat(document.getElementById('diametro')?.value);
    const areaCelda = document.getElementById('areaCelda');

    if (!diametro || !areaCelda) return;

    if (!isNaN(diametro) && diametro > 0) {
        const radio = diametro / 2;
        const area = Math.PI * Math.pow(radio, 2);
        areaCelda.textContent = area.toFixed(2);

        // Añadir estilo a la celda de área
        areaCelda.className = 'px-3 py-2 border-r border-gray-300 text-center text-sm font-bold text-blue-700 bg-blue-50';

        // Recalcular esfuerzo en la tabla
        const filas = document.querySelectorAll('#tablaDatos tbody tr');
        filas.forEach(fila => {
            const carga = parseFloat(fila.querySelector('.carga')?.innerText.trim());
            const celdaEsfuerzo = fila.querySelector('.esfuerzo');

            if (!isNaN(carga)) {
                const esfuerzo = (carga / area).toFixed(2);
                celdaEsfuerzo.innerText = esfuerzo;
                celdaEsfuerzo.className = 'esfuerzo px-4 py-2 text-center text-sm font-medium text-green-700 bg-green-50';
            } else {
                celdaEsfuerzo.innerText = '';
                celdaEsfuerzo.className = 'esfuerzo px-4 py-2 text-center text-sm';
            }
        });

        actualizarGrafica();
    } else {
        areaCelda.textContent = '';
        areaCelda.className = 'px-3 py-2 border-r border-gray-300 text-center text-sm';

        const filas = document.querySelectorAll('#tablaDatos tbody tr');
        filas.forEach(fila => {
            const celdaEsfuerzo = fila.querySelector('.esfuerzo');
            if (celdaEsfuerzo) {
                celdaEsfuerzo.innerText = '';
                celdaEsfuerzo.className = 'esfuerzo px-4 py-2 text-center text-sm';
            }
        });

        actualizarGrafica();
    }
}

// FUNCIÓN PARA CALCULAR ESFUERZO AL INGRESAR ÁREA (MURETES Y PILAS)
function calcularEsfuerzoDesdeArea() {
    const areaInput = document.getElementById('areaInput');
    if (!areaInput) return;

    const nuevaArea = parseFloat(areaInput.value);
    const filas = document.querySelectorAll('#tablaDatos tbody tr');

    filas.forEach(fila => {
        const carga = parseFloat(fila.querySelector('.carga')?.innerText.trim());
        const celdaEsfuerzo = fila.querySelector('.esfuerzo');

        if (!isNaN(carga) && !isNaN(nuevaArea) && nuevaArea !== 0) {
            const esfuerzo = (carga / nuevaArea).toFixed(2);
            celdaEsfuerzo.innerText = esfuerzo;
            celdaEsfuerzo.className = 'esfuerzo px-4 py-2 text-center text-sm font-medium text-green-700 bg-green-50';
        } else {
            celdaEsfuerzo.innerText = '';
            celdaEsfuerzo.className = 'esfuerzo px-4 py-2 text-center text-sm';
        }
    });

    actualizarGrafica();
}

// DETECTAR TIPO DE FORMATO
function detectarTipoFormato() {
    const titulo = document.querySelector('h1')?.innerText || '';

    if (titulo.includes('CILINDROS')) return 'cilindros';
    if (titulo.includes('MURETES')) return 'muretes';
    if (titulo.includes('PILAS')) return 'pilas';

    return 'desconocido';
}

// ======== Cargar datos al iniciar ========
document.addEventListener('DOMContentLoaded', async function () {
    const simuladorCarga = new SimuladorDatosCarga();
    const tipoFormato = detectarTipoFormato();

    // Fecha actual (hoy)
    const hoy = new Date();
    const fechaActual = hoy.getFullYear() + "-" +
        String(hoy.getMonth() + 1).padStart(2, "0") + "-" +
        String(hoy.getDate()).padStart(2, "0");

    // Detectar el input de "Fecha de ruptura" de forma robusta
    const inputsFecha = document.querySelectorAll('input[type="date"]');
    inputsFecha.forEach(input => {
        const td = input.closest('td');
        if (!td) return;

        let thAnterior = td.previousElementSibling;
        while (thAnterior && thAnterior.tagName !== 'TH') {
            thAnterior = thAnterior.previousElementSibling;
        }
        if (!thAnterior) return;

        const textoTh = thAnterior.textContent.trim().toLowerCase();

        if (textoTh.includes('ruptura')) {
            input.value = fechaActual; // Siempre poner la fecha de hoy
        }
    });

    // Inicializar cálculos según el tipo de formato
    switch (tipoFormato) {
        case 'cilindros':
            calcularLongitudPromedioMM();
            calcularAreaCilindro();
            break;
        case 'muretes':
            calcularLongitudPromedioMM();
            break;
        case 'pilas':
            calcularPromedioLongitudMM();
            break;
    }

    // Cargar datos desde localStorage
    const datos = JSON.parse(localStorage.getItem('datosDeformaciones')) || [];
    const tbody = document.querySelector('#tablaDatos tbody');

    // Obtener longitud de control según el formato
    let longitudControl = null;
    if (document.getElementById('longitudPromedio')) {
        longitudControl = parseFloat(document.getElementById('longitudPromedio').value);
    } else if (document.getElementById('promedioLongitud')) {
        longitudControl = parseFloat(document.getElementById('promedioLongitud').value);
    }

    // Crear filas con deformaciones
    datos.forEach(dato => {
        const promedio = parseFloat(dato.promedio);
        const deformacionUnitaria = (!isNaN(longitudControl) && longitudControl > 0)
            ? (promedio / longitudControl).toFixed(6)
            : '';

        const fila = document.createElement('tr');
        fila.className = 'hover:bg-blue-50 transition-colors duration-150';
        fila.innerHTML = `
            <td class="px-4 py-2 text-center text-sm border-r border-gray-200 font-medium">${dato.tiempo}</td>
            <td class="px-4 py-2 text-center text-sm border-r border-gray-200">${dato.promedio}</td>
            <td class="deformacion px-4 py-2 text-center text-sm border-r border-gray-200">${deformacionUnitaria}</td>
            <td class="carga px-4 py-2 text-center text-sm border-r border-gray-200"></td>
            <td class="esfuerzo px-4 py-2 text-center text-sm"></td>
        `;
        tbody.appendChild(fila);
    });

    // ======== LECTURA DE DATOS DE CARGA DESDE SIMULADOR ========
    const filas = document.querySelectorAll('#tablaDatos tbody tr');

    try {
        const datosCarga = await simuladorCarga.obtenerDatosCarga();

        for (let i = 0; i < filas.length; i++) {
            const tiempoConfig = parseInt(filas[i].children[0].innerText.trim(), 10);

            const datoCarga = datosCarga.find(d => d.id === tiempoConfig);

            if (datoCarga) {
                const pesoKg = datoCarga.peso_enviado;
                const celdaCarga = filas[i].querySelector('.carga');
                celdaCarga.innerText = pesoKg;
                celdaCarga.className = 'carga px-4 py-2 text-center text-sm border-r border-gray-200 font-bold text-blue-700 bg-blue-50';
            }
        }

        // Calcular esfuerzo inicial según el formato
        switch (tipoFormato) {
            case 'cilindros':
                calcularAreaCilindro();
                break;
            case 'muretes':
            case 'pilas':
                calcularEsfuerzoDesdeArea();
                break;
        }
    } catch (error) {
        console.error("Error al obtener datos de carga:", error);
    }

    // Configurar event listeners según el formato
    if (document.getElementById('longitud1')) {
        const inputLong1 = document.getElementById('longitud1');
        const inputLong2 = document.getElementById('longitud2');
        if (inputLong1) inputLong1.addEventListener('input', calcularLongitudPromedioMM);
        if (inputLong2) inputLong2.addEventListener('input', calcularLongitudPromedioMM);
    }

    if (document.getElementById('diametro')) {
        const inputDiametro = document.getElementById('diametro');
        if (inputDiametro) inputDiametro.addEventListener('input', calcularAreaCilindro);
    }

    if (document.getElementById('long1Lado1')) {
        ['long1Lado1', 'long1Lado2', 'long2Lado1', 'long2Lado2', 'long3Lado1', 'long3Lado2']
            .forEach(id => {
                const input = document.getElementById(id);
                if (input) input.addEventListener('input', calcularPromedioLongitudMM);
            });
    }

    const areaInput = document.getElementById('areaInput');
    if (areaInput) {
        areaInput.addEventListener('input', calcularEsfuerzoDesdeArea);
    }

    // Posicionar botones correctamente
    const botones = document.getElementById('contenedorBotones');
    const tabla = document.querySelector('#tablaDatos');
    if (botones && tabla) {
        tabla.insertAdjacentElement('afterend', botones);
    }
});

// ===== FUNCIÓN DE VALIDACIÓN GENERAR PDF =====
function validarDatosParaPDF() {
    const tipoFormato = detectarTipoFormato();

    // Validar tabla de datos generales
    const inputsGenerales = document.querySelectorAll('input[type="number"], input[type="text"], input[type="date"]');
    for (let input of inputsGenerales) {
        if (!input.readOnly && !input.disabled && input.value.trim() === '') {
            alert(`Debes ingresar el dato: ${input.previousElementSibling?.textContent || input.placeholder}`);
            input.focus();
            input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
            setTimeout(() => {
                input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
            }, 3000);
            return false;
        }
    }

    // Validaciones específicas por formato
    switch (tipoFormato) {
        case 'cilindros':
            if (!document.getElementById('longitudPromedio')?.value) {
                alert("Debes ingresar las longitudes de control para calcular el promedio.");
                return false;
            }
            if (!document.getElementById('areaCelda')?.textContent) {
                alert("Debes ingresar el diámetro para calcular el área.");
                return false;
            }
            break;
        case 'muretes':
            if (!document.getElementById('longitudPromedio')?.value) {
                alert("Debes ingresar las longitudes de control para calcular el promedio.");
                return false;
            }
            if (!document.getElementById('areaInput')?.value) {
                alert("Debes ingresar el área.");
                return false;
            }
            break;
        case 'pilas':
            if (!document.getElementById('promedioLongitud')?.value) {
                alert("Debes ingresar las longitudes de control para calcular el promedio.");
                return false;
            }
            if (!document.getElementById('areaInput')?.value) {
                alert("Debes ingresar el área.");
                return false;
            }
            break;
    }

    // Validar tabla de mediciones
    const filas = document.querySelectorAll('#tablaDatos tbody tr');
    if (filas.length === 0) {
        alert("No hay datos de mediciones. Primero debe cargar datos desde la página principal.");
        return false;
    }

    for (let fila of filas) {
        const celdas = fila.querySelectorAll('td');
        for (let celda of celdas) {
            if (celda.innerText.trim() === '' || celda.innerText.trim() === '-') {
                alert("Hay datos faltantes en la tabla de mediciones.");
                return false;
            }
        }
    }

    // Validar que se haya graficado
    if (!graficarHabilitado) {
        alert("Primero debes hacer clic en 'Graficar' para generar la curva esfuerzo-deformación.");
        document.getElementById('btnGraficar').focus();
        return false;
    }

    // Validar que la gráfica esté visible
    const contenedorGrafica = document.getElementById('contenedorGrafica');
    if (!contenedorGrafica || contenedorGrafica.style.display === 'none') {
        alert("La gráfica no está visible. Primero haz clic en 'Graficar'.");
        return false;
    }

    return true;
}

// Botón generar PDF (funcionalidad común)
document.getElementById('btnGenerarPDF').addEventListener('click', async function () {
    if (!validarDatosParaPDF()) return;

    const contenido = document.querySelector('.bg-white.rounded-2xl');
    const canvas = document.getElementById('graficaDeformaciones');

    if (!canvas) {
        alert("No se puede generar PDF sin gráfica. Primero haga clic en 'Graficar'.");
        return;
    }

    const imgData = canvas.toDataURL('image/png', 1.0);
    const contenidoClonado = contenido.cloneNode(true);

    // Aplicar estilos específicos para PDF al clon
    contenidoClonado.classList.add('pdf-version');

    // Reemplazar el canvas por imagen en el clon
    const canvasClon = contenidoClonado.querySelector('#graficaDeformaciones');
    if (canvasClon) {
        const img = document.createElement('img');
        img.src = imgData;
        img.className = 'w-full h-auto border border-gray-300 rounded-lg';
        img.alt = 'Gráfica de Esfuerzo-Deformación';
        img.style.maxHeight = '250px'; // Más pequeño para PDF
        canvasClon.replaceWith(img);
    }

    // Ocultar los botones en el clon
    const botonesClon = contenidoClonado.querySelector('#contenedorBotones');
    if (botonesClon) botonesClon.style.display = 'none';

    // Nombre del archivo según formato
    const tipoFormato = detectarTipoFormato();
    let nombreArchivo = `formato-ensaye-${tipoFormato}.pdf`;

    const opciones = {
        margin: [5, 5, 5, 5],
        filename: nombreArchivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 1.5,
            useCORS: true,
            scrollX: 0,
            scrollY: 0
        },
        jsPDF: {
            unit: 'mm',
            format: 'letter',
            orientation: 'portrait',
            compress: true
        }
    };

    try {
        await html2pdf().set(opciones).from(contenidoClonado).save();

        // Limpiar datos después de generar PDF
        localStorage.removeItem('datosDeformaciones');

        // Mostrar mensaje de éxito
        alert("PDF generado exitosamente. Los datos han sido eliminados del sistema.");

        // Recargar después de un breve retraso
        setTimeout(() => {
            location.reload();
        }, 1500);

    } catch (error) {
        console.error("Error al generar PDF:", error);
        alert("Error al generar el PDF. Por favor, intente nuevamente.");
    }
});

// Botón Graficar (funcionalidad común)
document.getElementById('btnGraficar').addEventListener('click', function () {
    graficarHabilitado = true;

    // MOSTRAR el contenedor de la gráfica
    const contenedorGrafica = document.getElementById('contenedorGrafica');
    if (contenedorGrafica) {
        contenedorGrafica.style.display = 'block';
    }

    actualizarGrafica();
    moverBotonesDebajoGrafica();
});

// Función para mover botones
function moverBotonesDebajoGrafica() {
    const botones = document.getElementById('contenedorBotones');
    const contenedorGrafica = document.querySelector('.bg-white.border');
    if (botones && contenedorGrafica) {
        contenedorGrafica.insertAdjacentElement('afterend', botones);
    }
}

// Función para actualizar la gráfica 
function actualizarGrafica() {
    if (!graficarHabilitado) return;

    const filas = document.querySelectorAll('#tablaDatos tbody tr');
    const deformaciones = [];
    const esfuerzos = [];

    filas.forEach(fila => {
        const deformacion = parseFloat(fila.querySelector('.deformacion')?.innerText.trim());
        const esfuerzo = parseFloat(fila.querySelector('.esfuerzo')?.innerText.trim());

        if (!isNaN(deformacion) && !isNaN(esfuerzo)) {
            deformaciones.push(deformacion);
            esfuerzos.push(esfuerzo);
        }
    });

    if (deformaciones.length === 0 || esfuerzos.length === 0) {
        console.warn("No hay datos suficientes para graficar");
        alert("No hay datos suficientes para graficar. Verifica que todos los campos estén completos.");
        return;
    }

    const ctx = document.getElementById('graficaDeformaciones').getContext('2d');

    // Destruir gráfica anterior si existe
    if (window.miGrafica) {
        window.miGrafica.destroy();
    }

    const tipoFormato = detectarTipoFormato();
    const tituloFormato = tipoFormato.charAt(0).toUpperCase() + tipoFormato.slice(1);

    window.miGrafica = new Chart(ctx, {
        type: 'line',
        data: {
            labels: deformaciones,
            datasets: [
                {
                    label: `Curva Esfuerzo-Deformación (${tituloFormato})`,
                    data: esfuerzos,
                    borderColor: 'rgb(37, 99, 235)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: deformaciones.length > 25 ? 1.5 : 2.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: deformaciones.length > 30 ? 2 : 4,
                    pointBackgroundColor: 'rgb(37, 99, 235)',
                    pointBorderColor: 'white',
                    pointBorderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                title: {
                    display: true,
                    text: `Curva Esfuerzo - Deformación - ${tituloFormato}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    color: '#1e3a8a',
                    padding: {
                        top: 10,
                        bottom: 30
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} kg/cm²`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Deformación Unitaria (ε)',
                        font: {
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Esfuerzo (σ) kg/cm²',
                        font: {
                            weight: 'bold'
                        }
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
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Exportar funciones necesarias (si se requieren desde otros archivos)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calcularLongitudPromedioMM,
        calcularPromedioLongitudMM,
        calcularAreaCilindro,
        calcularEsfuerzoDesdeArea,
        detectarTipoFormato,
        validarDatosParaPDF
    };
}