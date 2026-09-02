const API_URL = 'https://68490b7c45f4c0f5ee6fccce.mockapi.io/api/df/productos';

let productosCache = [];
let pestanaActiva = 'lista';
let idParaEliminar = null;
let subIndexEliminar = null;

const NOMBRES_SECCIONES = {
    'Sección 1': 'SECCIÓN 1',
    'Sección 2': 'SECCIÓN 2',
    'Sección 3': 'SECCIÓN 3',
    'Sección 5': 'SECCIÓN 5',
    'seccion_1': 'SECCIÓN 1',
    'seccion_2': 'SECCIÓN 2',
    'seccion_3': 'SECCIÓN 3',
    'seccion_5': 'SECCIÓN 5',
};

function formatearNombre(texto) {
    if (!texto) return '';
    const limpio = texto.trim();
    return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

document.addEventListener('DOMContentLoaded', () => {
    const navEntries = performance.getEntriesByType('navigation');
    const esRecarga = navEntries.length > 0 && navEntries[0].type === 'reload';

    if (esRecarga) {
        pestanaActiva =
            sessionStorage.getItem('pestana_despensa_activa') || 'lista';
    } else {
        pestanaActiva = 'lista';
        sessionStorage.setItem('pestana_despensa_activa', 'lista');
    }

    cambiarPestana(pestanaActiva);
    cargarDatos();

    if (document.getElementById('view-gas-registros')) {
        cargarRegistrosGas();
    }
});

function normalizarSeccion(seccion) {
    if (!seccion) return '';
    const limpia = seccion.toString().toLowerCase().trim().replace(/[_]/g, ' ');
    if (limpia.includes('1')) return 'Sección 1';
    if (limpia.includes('2')) return 'Sección 2';
    if (limpia.includes('3')) return 'Sección 3';
    if (limpia.includes('5')) return 'Sección 5';
    return seccion;
}

function obtenerClaseSeccion(seccion) {
    const secLimpia = normalizarSeccion(seccion);
    if (secLimpia === 'Sección 1') return 'sec-1';
    if (secLimpia === 'Sección 2') return 'sec-2';
    if (secLimpia === 'Sección 3') return 'sec-3';
    if (secLimpia === 'Sección 5') return 'sec-5';
    return '';
}

function cambiarPestana(tab) {
    pestanaActiva = tab;
    sessionStorage.setItem('pestana_despensa_activa', tab);

    document.querySelectorAll('.nav-tab').forEach((btn) => {
        const txtBtn = normalizarSeccion(btn.textContent);
        const txtTab = normalizarSeccion(tab);

        const esActivo =
            txtBtn === txtTab ||
            (tab === 'lista' &&
                btn.textContent.toLowerCase().includes('lista')) ||
            (tab === 'config' &&
                btn.textContent.toLowerCase().includes('config'));

        btn.classList.remove(
            'active',
            'tab-sec-1',
            'tab-sec-2',
            'tab-sec-3',
            'tab-sec-5',
        );

        if (esActivo) {
            btn.classList.add('active');

            const secLimpia = normalizarSeccion(tab);
            if (secLimpia === 'Sección 1') btn.classList.add('tab-sec-1');
            if (secLimpia === 'Sección 2') btn.classList.add('tab-sec-2');
            if (secLimpia === 'Sección 3') btn.classList.add('tab-sec-3');
            if (secLimpia === 'Sección 5') btn.classList.add('tab-sec-5');
        }
    });

    const vProds = document.getElementById('view-productos');
    const vConfig = document.getElementById('view-config');

    if (vConfig && vProds) {
        if (tab === 'config') {
            vProds.style.display = 'none';
            vConfig.style.display = 'block';
            poblarSelectPadres();
        } else {
            vConfig.style.display = 'none';
            vProds.style.display = 'block';
            renderProductos();
        }
    }
}

async function cargarDatos() {
    const container = document.getElementById('view-productos');

    if (container && pestanaActiva !== 'config') {
        container.innerHTML = `<div class="loading-spinner">⏳ Cargando productos...</div>`;
    }

    try {
        const res = await fetch(API_URL);
        productosCache = await res.json();

        if (pestanaActiva === 'config') {
            poblarSelectPadres();
        } else {
            renderProductos();
        }
    } catch (err) {
        if (container && pestanaActiva !== 'config') {
            container.innerHTML = `<div class="loading-spinner">Error al cargar datos ❌</div>`;
        }
        showToast('Error de conexión al cargar datos', 'delete');
    }
}

function renderProductos() {
    const container = document.getElementById('view-productos');
    if (!container) return;
    container.innerHTML = '';

    let filtrados = productosCache.filter((p) => {
        if (pestanaActiva === 'lista') return true;
        return (
            normalizarSeccion(p.seccion) === normalizarSeccion(pestanaActiva)
        );
    });

    filtrados.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    );

    if (filtrados.length === 0) {
        container.innerHTML = `<div class="loading-spinner">No hay productos en esta sección.</div>`;
        return;
    }

    filtrados.forEach((p) => {
        const sinStock = p.tieneCantidad
            ? p.cantidad <= 0
            : p.estado === 'no_hay';
        const nombreSeccionFormateado =
            NOMBRES_SECCIONES[p.seccion] ||
            NOMBRES_SECCIONES[normalizarSeccion(p.seccion)] ||
            p.seccion.toUpperCase();
        const claseColorSeccion = obtenerClaseSeccion(p.seccion);

        let html = `
            <div class="product-card ${sinStock ? 'out-of-stock' : ''}">
                <div class="product-info-inline">
                    <strong class="prod-title">${p.nombre}</strong>
                    <span class="badge-section ${claseColorSeccion}">${nombreSeccionFormateado}</span>
                </div>
                <div class="controls">
                    ${
                        p.tieneCantidad
                            ? `
                        <button class="btn-minus" onclick="modCantidad('${p.id}',${p.cantidad - 1})">-</button>
                        <span class="qty-number">${p.cantidad}</span>
                        <button class="btn-plus" onclick="modCantidad('${p.id}',${p.cantidad + 1})">+</button>
                    `
                            : ''
                    }

                    ${
                        !p.tieneCantidad && !p.esPadre
                            ? `
                        <button class="${p.estado === 'hay' ? 'btn-status-hay' : 'btn-status-nohay'}" onclick="toggleEstado('${p.id}', '${p.estado}')">
                            ${p.estado === 'hay' ? 'Hay' : 'No hay'}
                        </button>
                    `
                            : ''
                    }

                    <div class="action-stack">
                        <button class="btn-icon btn-edit" onclick="abrirModalEdit('${p.id}')">✏️</button>
                        <button class="btn-icon btn-delete" onclick="pedirConfirmación('${p.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;

        if (p.esPadre && p.subproductos && p.subproductos.length > 0) {
            p.subproductos.sort((a, b) =>
                a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
            );

            html += `<div class="subproduct-tree">`;
            p.subproductos.forEach((sub, idx) => {
                const subOut = sub.tieneCantidad
                    ? sub.cantidad <= 0
                    : sub.estado === 'no_hay';

                html += `
                    <div class="product-card ${subOut ? 'out-of-stock' : ''}" style="padding: 0.5rem 0.6rem;">
                        <span>↳ ${sub.nombre}</span>
                        <div class="controls">
                            ${
                                sub.tieneCantidad
                                    ? `
                                <button class="btn-minus" onclick="modCantSub('${p.id}', ${idx}, ${sub.cantidad - 1})">-</button>
                                <span class="qty-number">${sub.cantidad}</span>
                                <button class="btn-plus" onclick="modCantSub('${p.id}', ${idx}, ${sub.cantidad + 1})">+</button>
                            `
                                    : `
                                <button class="${sub.estado === 'hay' ? 'btn-status-hay' : 'btn-status-nohay'}" onclick="toggleEstadoSub('${p.id}', ${idx})">
                                    ${sub.estado === 'hay' ? 'Hay' : 'No hay'}
                                </button>
                            `
                            }
                            <div class="action-stack">
                                <button class="btn-icon btn-edit" onclick="abrirModalEdit('${p.id}', ${idx})">✏️</button>
                                <button class="btn-icon btn-delete" onclick="pedirConfirmación('${p.id}', ${idx})">🗑️</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        container.innerHTML += html;
    });
}

async function toggleEstado(id, estadoActual) {
    const nuevo = estadoActual === 'hay' ? 'no_hay' : 'hay';

    const prod = productosCache.find((p) => p.id === id);
    if (prod) prod.estado = nuevo;
    renderProductos();

    await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo }),
    });
}

async function modCantidad(id, nueva) {
    if (nueva < 0) return;

    const prod = productosCache.find((p) => p.id === id);
    if (prod) {
        prod.cantidad = nueva;
        prod.estado = nueva > 0 ? 'hay' : 'no_hay';
    }
    renderProductos();

    await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cantidad: nueva,
            estado: nueva > 0 ? 'hay' : 'no_hay',
        }),
    });
}

async function toggleEstadoSub(padreId, idx) {
    const padre = productosCache.find((p) => p.id === padreId);
    if (!padre) return;

    padre.subproductos[idx].estado =
        padre.subproductos[idx].estado === 'hay' ? 'no_hay' : 'hay';
    renderProductos();

    await fetch(`${API_URL}/${padreId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subproductos: padre.subproductos }),
    });
}

async function modCantSub(padreId, idx, nueva) {
    if (nueva < 0) return;
    const padre = productosCache.find((p) => p.id === padreId);
    if (!padre) return;

    padre.subproductos[idx].cantidad = nueva;
    padre.subproductos[idx].estado = nueva > 0 ? 'hay' : 'no_hay';
    renderProductos();

    await fetch(`${API_URL}/${padreId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subproductos: padre.subproductos }),
    });
}

function abrirModalEdit(id, subIndex = null) {
    const p = productosCache.find((item) => item.id === id);
    if (!p) return;

    document.getElementById('edit-id').value = id;
    document.getElementById('edit-sub-index').value =
        subIndex !== null ? subIndex : '';

    const isSub = subIndex !== null;
    const target = isSub ? p.subproductos[subIndex] : p;

    document.getElementById('modal-edit-title').innerText = isSub
        ? `Editar subproducto: ${target.nombre}`
        : `Editar: ${target.nombre}`;
    document.getElementById('edit-nombre').value = target.nombre;

    document.getElementById('box-edit-seccion').style.display = isSub
        ? 'none'
        : 'block';
    if (!isSub)
        document.getElementById('edit-seccion').value = normalizarSeccion(
            p.seccion,
        );

    if (p.esPadre && !isSub) {
        document.getElementById('box-edit-tipo').style.display = 'none';
        document.getElementById('box-edit-cant').style.display = 'none';
        document.getElementById('box-edit-estado').style.display = 'none';
    } else {
        document.getElementById('box-edit-tipo').style.display = 'block';
        const tipoVal = target.tieneCantidad ? 'cantidad' : 'estado';
        document.getElementById('edit-tipo').value = tipoVal;
        document.getElementById('edit-cantidad').value = target.cantidad || 0;
        document.getElementById('edit-estado').value = target.estado || 'hay';
        toggleEditType(tipoVal);
    }

    document.getElementById('modal-edit').style.display = 'flex';
}

function toggleEditType(val) {
    document.getElementById('box-edit-cant').style.display =
        val === 'cantidad' ? 'block' : 'none';
    document.getElementById('box-edit-estado').style.display =
        val === 'estado' ? 'block' : 'none';
}

function cerrarModalEdit() {
    document.getElementById('modal-edit').style.display = 'none';
}

async function guardarEdicion() {
    const id = document.getElementById('edit-id').value;
    const subIdx = document.getElementById('edit-sub-index').value;
    const nombreRaw = document.getElementById('edit-nombre').value;
    const nombre = formatearNombre(nombreRaw);

    const padre = productosCache.find((p) => p.id === id);

    if (subIdx !== '') {
        const idx = parseInt(subIdx);
        const tipo = document.getElementById('edit-tipo').value;
        padre.subproductos[idx].nombre = nombre;
        padre.subproductos[idx].tieneCantidad = tipo === 'cantidad';
        padre.subproductos[idx].cantidad =
            tipo === 'cantidad'
                ? parseInt(document.getElementById('edit-cantidad').value) || 0
                : 0;
        padre.subproductos[idx].estado =
            tipo === 'estado'
                ? document.getElementById('edit-estado').value
                : padre.subproductos[idx].cantidad > 0
                ? 'hay'
                : 'no_hay';

        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subproductos: padre.subproductos }),
        });
    } else if (padre.esPadre) {
        const seccion = document.getElementById('edit-seccion').value;
        padre.nombre = nombre;
        padre.seccion = seccion;

        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, seccion: seccion }),
        });
    } else {
        const seccion = document.getElementById('edit-seccion').value;
        const tipo = document.getElementById('edit-tipo').value;
        const cant =
            parseInt(document.getElementById('edit-cantidad').value) || 0;
        const est = document.getElementById('edit-estado').value;

        padre.nombre = nombre;
        padre.seccion = seccion;
        padre.tieneCantidad = tipo === 'cantidad';
        padre.cantidad = tipo === 'cantidad' ? cant : 0;
        padre.estado =
            tipo === 'cantidad' ? (cant > 0 ? 'hay' : 'no_hay') : est;

        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre,
                seccion: seccion,
                tieneCantidad: padre.tieneCantidad,
                cantidad: padre.cantidad,
                estado: padre.estado,
            }),
        });
    }

    cerrarModalEdit();
    showToast('Registro editado correctamente.', 'edit');
    renderProductos();
}

function pedirConfirmación(id, subIndex = null) {
    idParaEliminar = id;
    subIndexEliminar = subIndex;
    document.getElementById('modal-confirm').style.display = 'flex';
    document.getElementById('btn-confirm-delete').onclick = ejecutarEliminación;
}

function cerrarModal() {
    document.getElementById('modal-confirm').style.display = 'none';
    idParaEliminar = null;
    subIndexEliminar = null;
}

async function ejecutarEliminación() {
    if (!idParaEliminar) return;

    const scrollPos = window.scrollY;

    if (subIndexEliminar !== null) {
        const padre = productosCache.find((p) => p.id === idParaEliminar);
        if (padre) padre.subproductos.splice(subIndexEliminar, 1);

        await fetch(`${API_URL}/${idParaEliminar}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subproductos: padre ? padre.subproductos : [],
            }),
        });
    } else {
        productosCache = productosCache.filter((p) => p.id !== idParaEliminar);
        await fetch(`${API_URL}/${idParaEliminar}`, { method: 'DELETE' });
    }

    cerrarModal();
    showToast('Registro eliminado con éxito.', 'delete');
    renderProductos();

    window.scrollTo(0, scrollPos);
}

function actualizarFormularioTipo(val) {
    document.getElementById('box-cantidad').style.display =
        val === 'cantidad' ? 'block' : 'none';
    document.getElementById('box-estado').style.display =
        val === 'estado' ? 'block' : 'none';
}

function actualizarFormSubprod(val) {
    document.getElementById('box-subprod-cant').style.display =
        val === 'cantidad' ? 'block' : 'none';
    document.getElementById('box-subprod-estado').style.display =
        val === 'estado' ? 'block' : 'none';
}

function poblarSelectPadres() {
    const select = document.getElementById('select-padre');
    if (!select) return;
    const padres = productosCache.filter((p) => p.esPadre);
    select.innerHTML = padres
        .map((p) => {
            const nombreSeccionFormateado =
                NOMBRES_SECCIONES[p.seccion] ||
                NOMBRES_SECCIONES[normalizarSeccion(p.seccion)] ||
                p.seccion;
            return `<option value="${p.id}">${p.nombre} (${nombreSeccionFormateado})</option>`;
        })
        .join('');
}

async function crearProducto(e) {
    e.preventDefault();
    const tipo = document.getElementById('tipo-prod').value;

    const nuevo = {
        nombre: formatearNombre(document.getElementById('nombre-prod').value),
        seccion: document.getElementById('seccion-prod').value,
        tieneCantidad: tipo === 'cantidad',
        cantidad:
            tipo === 'cantidad'
                ? parseInt(document.getElementById('cant-prod').value)
                : 0,
        estado:
            tipo === 'estado'
                ? document.getElementById('estado-prod').value
                : 'hay',
        esPadre: tipo === 'padre',
        subproductos: [],
    };

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
    });

    const productoCreado = await res.json();
    productosCache.push(productoCreado);

    if (productoCreado.esPadre) {
        poblarSelectPadres();
    }

    e.target.reset();
    showToast('Producto agregado con éxito.', 'add');
    renderProductos();
}

async function crearSubproducto(e) {
    e.preventDefault();
    const padreId = document.getElementById('select-padre').value;
    const tipo = document.getElementById('tipo-subprod').value;
    const padre = productosCache.find((p) => p.id === padreId);

    const nuevoSub = {
        nombre: formatearNombre(
            document.getElementById('nombre-subprod').value,
        ),
        tieneCantidad: tipo === 'cantidad',
        cantidad:
            tipo === 'cantidad'
                ? parseInt(document.getElementById('cant-subprod').value)
                : 0,
        estado:
            tipo === 'estado'
                ? document.getElementById('estado-subprod').value
                : 'hay',
    };

    if (padre) {
        padre.subproductos = padre.subproductos
            ? [...padre.subproductos, nuevoSub]
            : [nuevoSub];

        await fetch(`${API_URL}/${padreId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subproductos: padre.subproductos }),
        });
    }

    e.target.reset();
    showToast('Subproducto agregado con éxito.', 'add');
    renderProductos();
}

function showToast(mensaje, tipo = 'add') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let icon = '✔';
    let textoFinal = mensaje;

    if (tipo === 'add') {
        icon = '✔';
        textoFinal = mensaje || 'Agregado correctamente.';
    } else if (tipo === 'edit') {
        icon = '✏️';
        textoFinal = mensaje || 'Editado correctamente.';
    } else if (tipo === 'delete') {
        icon = '🗑️';
        textoFinal = mensaje || 'Eliminado correctamente.';
    }

    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `
    <div class="toast-content">
    <span class="toast-icon">${icon}</span>
    <span>${textoFinal}</span>
    </div>
    <button class="btn-toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

let dictarNombreTimeout = null;

function dictarNombre(idInput, idStatus, btnElemento) {
    const input = document.getElementById(idInput);
    const status = document.getElementById(idStatus);
    if (!input) return;

    if (dictarNombreTimeout) clearTimeout(dictarNombreTimeout);

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        if (status)
            status.textContent = 'Navegador no compatible con micrófono.';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let hasHeardSpeech = false;
    let finalTranscript = '';

    if (btnElemento) btnElemento.classList.add('recording');
    if (status) status.textContent = 'Escuchando... habla ahora';

    recognition.onspeechstart = () => {
        hasHeardSpeech = true;
    };

    recognition.onresult = (e) => {
        let texto = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            texto += e.results[i][0].transcript;
        }

        texto = texto.toLowerCase().replace(/[.,]/g, '').trim();

        if (texto.length > 0) {
            texto =
                typeof formatearNombre === 'function'
                    ? formatearNombre(texto)
                    : texto;
        }

        finalTranscript = texto;
        input.value = texto;
    };

    recognition.onerror = (e) => {
        if (btnElemento) btnElemento.classList.remove('recording');
        if (status) {
            if (e.error === 'no-speech') {
                status.textContent =
                    'No se escuchó nada. Intenta hablar más fuerte.';
            } else {
                status.textContent = `Error al escuchar (${e.error}).`;
            }
            dictarNombreTimeout = setTimeout(() => {
                if (status) status.textContent = '';
            }, 4000);
        }
    };

    recognition.onend = () => {
        if (btnElemento) btnElemento.classList.remove('recording');
        if (!status) return;

        if (finalTranscript) {
            status.textContent = `Registro escuchado: "${finalTranscript}"`;
            dictarNombreTimeout = setTimeout(() => {
                if (status) status.textContent = '';
            }, 4000);
        } else if (!hasHeardSpeech) {
            status.textContent = 'No se detectó voz. Intenta nuevamente.';
            dictarNombreTimeout = setTimeout(() => {
                if (status) status.textContent = '';
            }, 4000);
        }
    };

    recognition.start();
}
