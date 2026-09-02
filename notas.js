const API_URL = 'https://6a8a52b720fcac8c1edf2740.mockapi.io/compras';

const postitForm = document.getElementById('postit-form');
const inputNota = document.getElementById('input-nota');
const postitsContainer = document.getElementById('postits-container');
const btnMic = document.getElementById('btn-mic');
const voiceStatus = document.getElementById('voice-status');

let voiceTimeout = null;
let currentPostits = [];

const PASTEL_COLORS = [
    'bg-pastel-yellow', 'bg-pastel-pink', 'bg-pastel-blue', 'bg-pastel-green', 'bg-pastel-purple', 'bg-pastel-orange', 'bg-pastel-mint',
];

const ROTATION_ANGLES = [
    'rotate(-3deg)', 'rotate(-2deg)', 'rotate(-1deg)', 'rotate(1deg)', 'rotate(2deg)', 'rotate(3deg)',
];

const PALABRAS_CLAVE = [
    // --- Personas ---
    'abuela', 'abuelo', 'alejandra', 'carmen', 'hija', 'hijo', 'mamá', 'macaca', 'macaco', 'milagro', 'mona', 'mono', 'nelly', 'papá',
    'renata', 'renato', 'rodrigo', 'señora carmen', 'sra carmen', 'sra. carmen', 'viejito', 'viejo', 'yeya',

    // --- Salud ---
    'agendar', 'clínica', 'dentista', 'doctor', 'examen', 'exámenes', 'farmacia', 'hospital', 'hora examen', 'hora exámenes',
    'hora médica', 'kinesiólogo', 'medicamento', 'medicamentos', 'médico', 'médicamente', 'receta', 'recetas', 'remedio',
    'remedios', 'reservar', 'toma de muestras', 'vacuna', 'vacunas',

    // --- Hogar ---
    'almuerzo', 'basura', 'casa', 'cena', 'cocinar', 'comida', 'desorden', 'flor', 'flores', 'jardín', 'limpiar', 'limpieza',
    'once', 'ordenar', 'planchar', 'planta', 'plantar', 'plantas', 'regar', 'reparar',

    // --- Servicios ---
    'agua', 'banco', 'boleta', 'cobro', 'cuota', 'factura', 'gas', 'gastos comunes', 'impuesto', 'impuestos', 'luz', 'pago',
    'pagar', 'servicios', 'transferencia', 'trámite', 'vencimiento', 'vender', 'venta',

    // --- Estudios ---
    'aprender', 'colegio', 'dictado', 'disertación', 'escuela', 'estudiar', 'evaluación', 'instituto', 'presentación', 'prueba',
    'reunión', 'tarea', 'trabajo', 'universidad',

    // --- Transporte ---
    'auto', 'batería', 'bencina', 'combustible', 'furgón', 'licencia', 'mecánico', 'permiso', 'petroleo', 'revisión', 'seguro',
    'taller',

    // --- Mascotas ---
    'alimento', 'alimentos', 'collar', 'desparasitaria', 'domino', 'toffy', 'pastilla desparasitaria', 'placa',

    // --- Eventos ---
    'cumpleaños', 'fecha', 'fechas', 'fiesta', 'fiestas', 'regalo', 'regalos',
];

document.addEventListener('DOMContentLoaded', () => {
    fetchPostits();
    inputNota.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            let val = inputNota.value;

            if (!val.startsWith('✦ ') && val.trim() !== '') {
                val = '✦ ' + val;
            } else if (val.trim() === '') {
                val = '✦ ';
            }

            inputNota.value = val + '\n✦ ';

            inputNota.style.height = '';
            inputNota.style.height = inputNota.scrollHeight + 'px';
        }
    });
});

async function fetchPostits() {
    try {
        postitsContainer.innerHTML = `
            <div class="loading-text">
                <i class="fa-solid fa-spinner fa-spin"></i> Cargando notas...
            </div>
        `;

        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Error API');

        const data = await response.json();
        currentPostits = data.filter(
            (item) => item.tipo === 'nota' || (item.nombre_nota && !item.tipo),
        );

        renderPostits(currentPostits);
    } catch (error) {
        console.error('Error:', error);
        postitsContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #ef4444; padding: 2rem;">
                Error al cargar las notas.
            </div>
        `;
    }
}

function renderPostits(list) {
    postitsContainer.innerHTML = '';

    if (list.length === 0) {
        postitsContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #ffffff; padding: 2rem; font-size: 0.9rem;">
                No hay notas pendientes.
            </div>
        `;
        return;
    }

    list.forEach((item) => {
        const card = crearTarjetaDOM(item);
        postitsContainer.appendChild(card);
    });
}

function crearTarjetaDOM(item) {
    const texto = item.nombre_nota || item.nombre || '';

    const seedStr = (item.id ? item.id.toString() : '') + texto;
    const colorIndex = Math.abs(hashCode(seedStr));

    const assignedColor = PASTEL_COLORS[colorIndex % PASTEL_COLORS.length];
    const assignedRotation =
        ROTATION_ANGLES[colorIndex % ROTATION_ANGLES.length];

    const card = document.createElement('div');
    card.className = `postit-card ${assignedColor}`;
    card.style.transform = assignedRotation;
    card.setAttribute('data-id', item.id);

    const textoConMayuscula = capitalizarPrimeraLetra(texto);
    const { textoLimpio, etiquetaPersona } =
        procesarEtiquetaYTexto(textoConMayuscula);
    const textoEtiqueta = etiquetaPersona ? etiquetaPersona : 'Nota';

    const lineas = textoLimpio.split('<br>');
    const contenidoFormateado = lineas
        .map((linea) => {
            const lineaTrim = linea.trim();
            if (lineaTrim.startsWith('✦ ')) {
                return `<span class="item-lista" onclick="this.classList.toggle('tachado')">${linea}</span>`;
            }
            return `<span>${linea}</span>`;
        })
        .join('<br>');

    card.innerHTML = `
        <div class="postit-badge">${textoEtiqueta}</div>
        <button class="close-postit-btn" onclick="deletePostit('${item.id}', this)">&times;</button>
        <p class="postit-text">${contenidoFormateado}</p>
    `;

    return card;
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
}

function capitalizarPrimeraLetra(texto) {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function procesarEtiquetaYTexto(texto) {
    let textoEscapado = escapeHTML(texto);
    textoEscapado = textoEscapado.replace(/\n/g, '<br>');

    let coincidenciasEncontradas = [];

    PALABRAS_CLAVE.forEach((palabra) => {
        const patron = palabra
            .replace(/[aá]/gi, '[aáAÁ]')
            .replace(/[eé]/gi, '[eéEÉ]')
            .replace(/[ií]/gi, '[iíIÍ]')
            .replace(/[oó]/gi, '[oóOÓ]')
            .replace(/[uú]/gi, '[uúUÚ]');

        const regex = new RegExp(
            `(?<=^|\\s|\\b)(${patron})(?=\\b|\\s|$)`,
            'gi',
        );

        const match = texto.match(regex);
        if (match && match.length > 0) {
            coincidenciasEncontradas.push(capitalizarPrimeraLetra(match[0]));
        }
    });

    const coincidenciasFiltradas = coincidenciasEncontradas.filter(
        (palabra, index, self) => {
            if (self.indexOf(palabra) !== index) return false;

            return !self.some(
                (otraPalabra) =>
                    otraPalabra !== palabra &&
                    otraPalabra.toLowerCase().includes(palabra.toLowerCase()),
            );
        },
    );

    let etiquetaPersona = null;
    if (coincidenciasFiltradas.length === 1) {
        etiquetaPersona = coincidenciasFiltradas[0];
    }

    return { textoLimpio: textoEscapado, etiquetaPersona };
}

let voiceMessageTimer = null;

function showVoiceMessage(msg, isError = false) {
    const statusElem = document.querySelector('.nota-voice-status');
    if (!statusElem) return;

    if (voiceMessageTimer) {
        clearTimeout(voiceMessageTimer);
        voiceMessageTimer = null;
    }

    if (msg === '') {
        statusElem.style.opacity = '0';
        statusElem.textContent = '';
        return;
    }

    statusElem.textContent = msg;
    statusElem.style.opacity = '1';

    if (isError) {
        voiceMessageTimer = setTimeout(() => {
            statusElem.style.opacity = '0';
        }, 4000);
    }
}

const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;

    let speechHandled = false;

    btnMic.addEventListener('click', () => {
        try {
            speechHandled = false;
            recognition.start();
        } catch (e) {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        speechHandled = false;
        btnMic.classList.add('listening');
        showVoiceMessage('Escuchando... habla ahora', false);
    };

    recognition.onresult = (event) => {
        let transcript = event.results[0][0].transcript.trim();

        if (transcript.endsWith('.')) {
            transcript = transcript.slice(0, -1);
        }

        if (transcript !== '') {
            speechHandled = true;
            inputNota.value = capitalizarPrimeraLetra(transcript);
            inputNota.style.height = '';
            inputNota.style.height = inputNota.scrollHeight + 'px';
            
            showVoiceMessage('', false);
        }
    };

    recognition.onerror = (event) => {
        speechHandled = true;
        btnMic.classList.remove('listening');

        if (event.error === 'audio-capture' || event.error === 'no-speech') {
            showVoiceMessage('No se escuchó nada. Intenta hablar más fuerte.', true);
        } else {
            showVoiceMessage('No se detectó voz. Intenta nuevamente.', true);
        }
    };

    recognition.onend = () => {
        btnMic.classList.remove('listening');
        
        if (!speechHandled) {
            showVoiceMessage('No se detectó voz. Intenta nuevamente.', true);
        }
    };
} else {
    btnMic.style.display = 'none';
}

postitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const textoNota = capitalizarPrimeraLetra(inputNota.value.trim());
    if (!textoNota) return;

    const tempId = Date.now().toString();
    const newPostit = { id: tempId, nombre_nota: textoNota, tipo: 'nota' };

    currentPostits.push(newPostit);

    const emptyMsg = postitsContainer.querySelector(
        'div[style*="grid-column"]',
    );
    if (emptyMsg) postitsContainer.innerHTML = '';

    const card = crearTarjetaDOM(newPostit);
    postitsContainer.appendChild(card);

    inputNota.value = '';
    inputNota.style.height = '';
    showVoiceMessage('', false);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_nota: textoNota, tipo: 'nota' }),
        });

        if (response.ok) {
            const savedItem = await response.json();

            const index = currentPostits.findIndex(
                (item) => item.id === tempId,
            );
            if (index !== -1) currentPostits[index].id = savedItem.id;

            card.setAttribute('data-id', savedItem.id);
            const btnDelete = card.querySelector('.close-postit-btn');
            if (btnDelete) {
                btnDelete.setAttribute(
                    'onclick',
                    `deletePostit('${savedItem.id}', this)`,
                );
            }
        }
    } catch (error) {
        console.error('Error al guardar la nota:', error);
    }
});

async function deletePostit(id, btnElement) {
    if (btnElement) {
        const cardNode = btnElement.closest('.postit-card');
        if (cardNode) cardNode.remove();
    }

    currentPostits = currentPostits.filter(
        (item) => item.id.toString() !== id.toString(),
    );

    if (currentPostits.length === 0) {
        postitsContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #ffffff; padding: 2rem; font-size: 0.9rem;">
                No hay notas pendientes.
            </div>
        `;
    }

    try {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    } catch (error) {
        console.error('Error al eliminar la nota:', error);
    }
}

function escapeHTML(str) {
    return str.replace(
        /[&<>'"]/g,
        (tag) =>
            ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
            })[tag] || tag,
    );
}
