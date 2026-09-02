document.addEventListener('DOMContentLoaded', () => {
    const API_COMPRAS = 'https://6a8a52b720fcac8c1edf2740.mockapi.io/compras';

    let productos = [];
    let ordenActual = 'prioridad';

    const form = document.getElementById('form-compras');
    const inputProducto = document.getElementById('input-producto');
    const selectPrioridad = document.getElementById('select-prioridad');
    const btnVoice = document.getElementById('btn-voice');
    const voiceStatus = document.getElementById('voice-status');
    const listaContainer = document.getElementById('lista-compras');
    const btnSortPriority = document.getElementById('sort-priority');
    const btnSortAlpha = document.getElementById('sort-alpha');

    async function cargarProductos() {
        if (listaContainer) {
            listaContainer.innerHTML =
                '<div style="text-align:center; color:#fff; padding:1.5rem;">⏳ Cargando lista...</div>';
        }

        try {
            const res = await fetch(API_COMPRAS);
            const data = await res.json();
            
            productos = data.filter(item => item.tipo === 'compra' || (item.nombre && !item.tipo && !item.nombre_nota));
            
            renderizarLista();
        } catch (err) {
            if (listaContainer) {
                listaContainer.innerHTML =
                    '<div style="text-align:center; color:#fff; padding:1.5rem;">Error al conectar con la API ❌</div>';
            }
        }
    }

    function renderizarLista() {
        if (!listaContainer) return;
        listaContainer.innerHTML = '';

        const listaOrdenada = obtenerProductosOrdenados();

        if (listaOrdenada.length === 0) {
            listaContainer.innerHTML = `
        <div style="text-align: center; color: #ffffff; padding: 2rem 0; font-size: 0.9rem;">
            No hay registros en la lista.
        </div>`;
            return;
        }

        listaOrdenada.forEach((item) => {
            const card = document.createElement('div');
            card.className = `product-card priority-${item.prioridad}`;

            let badgeHTML = '';
            if (item.prioridad === 'alta')
                badgeHTML = `<span class="badge-priority priority-tag-alta">ALTA</span>`;
            if (item.prioridad === 'media')
                badgeHTML = `<span class="badge-priority priority-tag-media">MEDIA</span>`;
            if (item.prioridad === 'baja')
                badgeHTML = `<span class="badge-priority priority-tag-baja">BAJA</span>`;

            card.innerHTML = `
        <div class="product-info-inline">
            ${badgeHTML}
            <span class="prod-title">${item.nombre}</span>
        </div>
        <div class="controls">
            <button type="button" class="btn-icon btn-borrar" style="cursor:pointer; font-size: 1.1rem;">🗑️</button>
        </div>
        `;

            const btnBorrar = card.querySelector('.btn-borrar');
            btnBorrar.addEventListener('click', () => {
                borrarProducto(item.id);
            });

            listaContainer.appendChild(card);
        });
    }

    function obtenerProductosOrdenados() {
        const copia = [...productos];
        const pesos = { alta: 1, media: 2, baja: 3, ninguna: 4 };

        if (ordenActual === 'prioridad') {
            return copia.sort((a, b) => {
                if (pesos[a.prioridad] !== pesos[b.prioridad]) {
                    return pesos[a.prioridad] - pesos[b.prioridad];
                }
                return a.nombre.localeCompare(b.nombre, 'es');
            });
        } else {
            return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        }
    }

    async function agregarProducto(nombre, prioridad) {
        const nuevo = { nombre, prioridad, tipo: 'compra' };

        try {
            const res = await fetch(API_COMPRAS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevo),
            });
            const creado = await res.json();
            productos.push(creado);
            renderizarLista();
        } catch (e) {
            cargarProductos();
        }
    }

    async function borrarProducto(id) {
        productos = productos.filter((item) => String(item.id) !== String(id));
        renderizarLista();

        try {
            await fetch(`${API_COMPRAS}/${id}`, { method: 'DELETE' });
        } catch (e) {
            cargarProductos();
        }
    }

    // Formulario manual
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const nombre = inputProducto.value.trim();
            const prioridad = selectPrioridad.value;

            if (!nombre) return;

            const nombreFormateado =
                nombre.charAt(0).toUpperCase() + nombre.slice(1);
            agregarProducto(nombreFormateado, prioridad);

            inputProducto.value = '';
            selectPrioridad.value = 'ninguna';
        });
    }

    // Filtros
    if (btnSortPriority) {
        btnSortPriority.addEventListener('click', () => {
            ordenActual = 'prioridad';
            btnSortPriority.classList.add('active');
            if (btnSortAlpha) btnSortAlpha.classList.remove('active');
            renderizarLista();
        });
    }

    if (btnSortAlpha) {
        btnSortAlpha.addEventListener('click', () => {
            ordenActual = 'alfabetico';
            btnSortAlpha.classList.add('active');
            if (btnSortPriority) btnSortPriority.classList.remove('active');
            renderizarLista();
        });
    }

    // Dictado por voz
    let voicePriorityTimeout = null;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && btnVoice) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-CL';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let hasHeardSpeech = false;
        let finalTranscript = '';
        let hasError = false; 

        btnVoice.addEventListener('click', () => {
            if (voicePriorityTimeout) clearTimeout(voicePriorityTimeout);
            hasHeardSpeech = false;
            finalTranscript = '';
            hasError = false;

            try {
                recognition.start();
                btnVoice.classList.add('recording');
                if (voiceStatus)
                    voiceStatus.textContent = 'Escuchando... habla ahora';
            } catch (e) {
                if (voiceStatus) voiceStatus.textContent = 'Micrófono en uso';
            }
        });

        recognition.onspeechstart = () => {
            hasHeardSpeech = true;
        };

        recognition.onresult = (e) => {
            let rawText = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                rawText += e.results[i][0].transcript;
            }

            finalTranscript = rawText;
        };

        recognition.onerror = (e) => {
            hasError = true; 
            btnVoice.classList.remove('recording');
            if (!voiceStatus) return;

            if (e.error === 'no-speech') {
                voiceStatus.textContent =
                    'No se escuchó nada. Intenta hablar más fuerte.';
            } else {
                voiceStatus.textContent = `Error al escuchar.`;
            }

            voicePriorityTimeout = setTimeout(() => {
                if (voiceStatus) voiceStatus.textContent = '';
            }, 4000);
        };

        recognition.onend = () => {
            btnVoice.classList.remove('recording');
            if (!voiceStatus || hasError) return; 

            let texto = finalTranscript
                .toLowerCase()
                .replace(/[.,]/g, '')
                .trim();

            if (texto) {
                let prioridad = 'ninguna';

                if (texto.includes('alta')) prioridad = 'alta';
                else if (texto.includes('media')) prioridad = 'media';
                else if (texto.includes('baja')) prioridad = 'baja';

                texto = texto
                    .replace(/\b(barra|diagonal|slash)\b/gi, '/')
                    .replace(/\s*\/\s*/g, ' / ')
                    .replace(
                        /\b(prioridad|alta|media|baja|sin|con|de|en|para)\b/gi,
                        '',
                    )
                    .replace(/\s+/g, ' ')
                    .trim();

                if (texto) {
                    const nombreFormateado =
                        texto.charAt(0).toUpperCase() + texto.slice(1);
                    agregarProducto(nombreFormateado, prioridad);
                    voiceStatus.textContent = `Registro escuchado: "${nombreFormateado}"`;
                } else {
                    voiceStatus.textContent =
                        'No se detectó un registro válido';
                }

                voicePriorityTimeout = setTimeout(() => {
                    if (voiceStatus) voiceStatus.textContent = '';
                }, 4000);
            } else if (!hasHeardSpeech) {
                voiceStatus.textContent =
                    'No se detectó voz. Intenta nuevamente.';
                voicePriorityTimeout = setTimeout(() => {
                    if (voiceStatus) voiceStatus.textContent = '';
                }, 4000);
            }
        };
    }

    cargarProductos();
});