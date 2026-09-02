const API_URL = 'https://6a92646f7751d35ce47ef00d.mockapi.io/supermercado';
const API_CARRITO_URL = 'https://6a92646f7751d35ce47ef00d.mockapi.io/carrito';

if (!sessionStorage.getItem('despensa_client_id')) {
    sessionStorage.setItem('despensa_client_id', 'client_' + Math.random().toString(36).substring(2, 9));
}

let productosDB = [];
let carrito = [];
let supermercados = []; 
let html5QrcodeScanner = null;
let camaraActiva = false;
let productoSeleccionadoEscaneo = null;
let ultimoCodigoEscaneadoDesconocido = '';
let accionConfirmarCallback = null;
let dictarNombreTimeout = null;
let activeRecognition = null;
let micEstaEscuchando = false;

let localActivoPrevio = localStorage.getItem('despensa_local_activo') || '';
let idRegistroSupermercados = null;
let vieneDesdeEscaner = false;
let estaProcesandoGuardado = false;

function formatearNombre(texto) {
    if (!texto) return '';
    const limpio = texto.trim().replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]/g, '');
    return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

document.addEventListener('DOMContentLoaded', async () => {
    const tabGuardada = sessionStorage.getItem('despensa_tab_activa') || 'escanner';

    inicializarEscaner();
    
    await sincronizarTodoDesdeServidor();
    switchTab(tabGuardada);

    setInterval(() => {
        const elActivo = document.activeElement;
        const estaEscribiendo = elActivo && (elActivo.tagName === 'INPUT' || elActivo.tagName === 'TEXTAREA');
        
        const modalEditAbierto = document.getElementById('modal-editar-producto') && document.getElementById('modal-editar-producto').style.display === 'flex';
        const modalConfirmAbierto = document.getElementById('modal-confirm') && document.getElementById('modal-confirm').style.display === 'flex';
        const modalCantidadAbierto = document.getElementById('modal-cantidad') && document.getElementById('modal-cantidad').style.display === 'flex';

        if (!estaProcesandoGuardado && !estaEscribiendo && !modalEditAbierto && !modalConfirmAbierto && !modalCantidadAbierto) {
            sincronizarTodoDesdeServidor().catch(err => console.warn('Error en sincronización continua:', err));
        }
    }, 1500);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !estaProcesandoGuardado) {
            sincronizarTodoDesdeServidor();
        }
    });
});

function switchTab(tab) {
    const secEscanner = document.getElementById('sec-escanner');
    const secAdmin = document.getElementById('sec-admin');
    const tabEscanner = document.getElementById('tab-escanner');
    const tabAdmin = document.getElementById('tab-admin');

    sessionStorage.setItem('despensa_tab_activa', tab);

    if (tab === 'escanner') {
        if (secEscanner) secEscanner.style.display = 'block';
        if (secAdmin) secAdmin.style.display = 'none';
        if (tabEscanner) tabEscanner.classList.add('active');
        if (tabAdmin) tabAdmin.classList.remove('active');
        iniciarCamara();
    } else {
        if (secEscanner) secEscanner.style.display = 'none';
        if (secAdmin) secAdmin.style.display = 'block';
        if (tabAdmin) tabAdmin.classList.add('active');
        if (tabEscanner) tabEscanner.classList.remove('active');
        detenerCamara();
    }
}

async function sincronizarTodoDesdeServidor() {
    try {
        const resProds = await fetch(API_URL, { cache: 'no-store' });
        if (resProds.ok) {
            const dataProds = await resProds.json();

            let listaFiltrada = [];
            let auxSupermercados = [];
            let superSeleccionadoServidor = null;
            let halladoRegistroSuper = false;

            dataProds.forEach(prod => {
                if (prod.codigoBarras === '__SUPERMERCADOS_DB__' || prod.nombre === '__SUPERMERCADOS_DB__') {
                    halladoRegistroSuper = true;
                    idRegistroSupermercados = String(prod.id);
                    
                    if (prod.localActivo) {
                        superSeleccionadoServidor = prod.localActivo;
                    }

                    try {
                        let parsed = typeof prod.precios === 'string' ? JSON.parse(prod.precios) : (prod.precios || []);
                        if (Array.isArray(parsed)) {
                            auxSupermercados = parsed;
                        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.lista)) {
                            auxSupermercados = parsed.lista;
                            if (!superSeleccionadoServidor && parsed.activo) {
                                superSeleccionadoServidor = parsed.activo;
                            }
                        }
                    } catch (e) { auxSupermercados = []; }
                    return;
                }

                if (!prod.codigoBarras || !prod.nombre) return;

                let preciosObj = {};
                if (prod.precios) {
                    try {
                        preciosObj = typeof prod.precios === 'string' ? JSON.parse(prod.precios) : prod.precios;
                    } catch (e) { preciosObj = {}; }
                }

                listaFiltrada.push({
                    id: String(prod.id),
                    codigoBarras: String(prod.codigoBarras),
                    nombre: prod.nombre,
                    precios: preciosObj
                });
            });

            if (!halladoRegistroSuper) {
                idRegistroSupermercados = null;
            }

            supermercados = Array.isArray(auxSupermercados) ? auxSupermercados.filter(s => typeof s === 'string' && s.trim().length > 0).sort() : [];

            if (superSeleccionadoServidor && supermercados.includes(superSeleccionadoServidor)) {
                if (localActivoPrevio !== superSeleccionadoServidor) {
                    localActivoPrevio = superSeleccionadoServidor;
                    localStorage.setItem('despensa_local_activo', superSeleccionadoServidor);
                }
            } else if (supermercados.length === 0) {
                localActivoPrevio = '';
                localStorage.setItem('despensa_local_activo', '');
            }

            productosDB = listaFiltrada;
            
            renderizarControlesSupermercados();
            renderizarTarjetasAdmin();
        }

        const resCart = await fetch(API_CARRITO_URL, { cache: 'no-store' });
        if (resCart.ok) {
            const dataCart = await resCart.json();
            const mapaCarrito = new Map();

            dataCart.forEach(item => {
                const prodId = String(item.productoId || item.id);
                if (!prodId) return;

                const cant = Number(item.cantidad) || 1;
                
                if (mapaCarrito.has(prodId)) {
                    const existente = mapaCarrito.get(prodId);
                    existente.cantidad += cant;
                    if (item.id) fetch(`${API_CARRITO_URL}/${item.id}`, { method: 'DELETE' }).catch(() => {});
                } else {
                    mapaCarrito.set(prodId, {
                        idServidor: String(item.id),
                        id: prodId,
                        codigoBarras: String(item.codigoBarras || ''),
                        nombre: item.nombre,
                        precios: typeof item.precios === 'string' ? JSON.parse(item.precios) : (item.precios || {}),
                        cantidad: cant
                    });
                }
            });

            carrito = Array.from(mapaCarrito.values());
        }

        actualizarPreciosPorSupermercado();
    } catch (e) {
        console.warn('Error en la sincronización remota:', e);
    }
}

function renderizarControlesSupermercados() {
    const select = document.getElementById('select-super');
    const containerTags = document.getElementById('supermercados-tags');
    const containerInputs = document.getElementById('inputs-precios-super');
    const editContainerInputs = document.getElementById('edit-inputs-precios-super');

    const modalEditAbierto = document.getElementById('modal-editar-producto') && document.getElementById('modal-editar-producto').style.display === 'flex';

    if (!select) return;

    if (supermercados.length === 0) {
        select.innerHTML = '<option value="">No hay locales registrados.</option>';
        if (containerTags) containerTags.innerHTML = '<small style="color:var(--text-muted);">No hay agregado ningún local aún.</small>';
        if (containerInputs) containerInputs.innerHTML = '<small style="color:var(--text-muted);">Agrega un local para ingresar precios.</small>';
        if (editContainerInputs && !modalEditAbierto) editContainerInputs.innerHTML = '<small style="color:var(--text-muted);">No hay locales registrados.</small>';
        return;
    }

    const htmlOpciones = supermercados.map(s => `<option value="${s}">${s.toUpperCase()}</option>`).join('');
    
    if (select.innerHTML !== htmlOpciones) {
        select.innerHTML = htmlOpciones;
    }

    if (localActivoPrevio && supermercados.includes(localActivoPrevio)) {
        if (select.value !== localActivoPrevio) {
            select.value = localActivoPrevio;
        }
    } else {
        localActivoPrevio = supermercados[0];
        select.value = localActivoPrevio;
        localStorage.setItem('despensa_local_activo', localActivoPrevio);
    }

    select.onchange = async () => {
        localActivoPrevio = select.value;
        localStorage.setItem('despensa_local_activo', localActivoPrevio);
        actualizarPreciosPorSupermercado();
        renderizarTarjetasAdmin();
        await guardarSupermercadosEnServidor();
    };

    if (containerTags) {
        containerTags.innerHTML = supermercados.map(s => `
            <div class="super-tag-item">
                <span>${s.toUpperCase()}</span>
                <button type="button" class="btn-icon btn-delete" title="Eliminar local" onclick="pedirEliminarSupermercado('${s}')">🗑️</button>
            </div>
        `).join('');
    }

    const estaEnInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (containerInputs && !estaEnInput) {
        containerInputs.innerHTML = supermercados.map(s => `
            <div class="form-group" style="margin-top: 0.4rem;">
                <label for="precio-${s}">${s.toUpperCase()}:</label>
                <input type="number" id="precio-${s}" min="0" placeholder="0" inputmode="numeric">
            </div>
        `).join('');
    }

    if (editContainerInputs && !estaEnInput && !modalEditAbierto) {
        editContainerInputs.innerHTML = supermercados.map(s => `
            <div class="form-group" style="margin-top: 0.4rem;">
                <label for="edit-precio-${s}">${s.toUpperCase()}:</label>
                <input type="number" id="edit-precio-${s}" min="0" placeholder="0" inputmode="numeric">
            </div>
        `).join('');
    }
}

async function agregarSupermercado() {
    const input = document.getElementById('nuevo-super-nombre');
    const val = input.value.trim().toLowerCase().replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]/g, '');

    if (!val) {
        showToast('Escribe un nombre de local válido.', 'info');
        return;
    }

    estaProcesandoGuardado = true;

    try {
        const resProds = await fetch(API_URL, { cache: 'no-store' });
        if (resProds.ok) {
            const dataProds = await resProds.json();
            const regSuper = dataProds.find(p => p.codigoBarras === '__SUPERMERCADOS_DB__' || p.nombre === '__SUPERMERCADOS_DB__');
            if (regSuper) {
                idRegistroSupermercados = String(regSuper.id);
                try {
                    let listaServidor = typeof regSuper.precios === 'string' ? JSON.parse(regSuper.precios) : regSuper.precios;
                    if (Array.isArray(listaServidor)) {
                        supermercados = Array.from(new Set([...supermercados, ...listaServidor]));
                    }
                } catch(e){}
            }
        }

        if (supermercados.includes(val)) {
            showToast('El local ya existe.', 'info');
            return;
        }

        supermercados.push(val);
        supermercados.sort();

        localActivoPrevio = val;
        localStorage.setItem('despensa_local_activo', val);

        productosDB.forEach(p => {
            if (!p.precios) p.precios = {};
            if (p.precios[val] === undefined) p.precios[val] = 0;
        });

        renderizarControlesSupermercados();
        renderizarTarjetasAdmin();
        actualizarPreciosPorSupermercado();
        input.value = '';

        await guardarSupermercadosEnServidor();
        showToast('Local agregado.', 'add');
    } catch(err) {
        console.error('Error al agregar local.', err);
        showToast('Error al guardar local.', 'delete');
    } finally {
        estaProcesandoGuardado = false;
        await sincronizarTodoDesdeServidor();
    }
}

function pedirEliminarSupermercado(superNombre) {
    abrirModalConfirmacion(
        `¿Deseas eliminar el local "${superNombre.toUpperCase()}"?`,
        async () => {
            supermercados = supermercados.filter(s => s !== superNombre);

            if (localActivoPrevio === superNombre) {
                localActivoPrevio = supermercados.length > 0 ? supermercados[0] : '';
                localStorage.setItem('despensa_local_activo', localActivoPrevio);
            }

            productosDB.forEach(prod => {
                if (prod.precios && prod.precios[superNombre] !== undefined) {
                    delete prod.precios[superNombre];
                }
            });

            renderizarControlesSupermercados();
            renderizarTarjetasAdmin();
            actualizarPreciosPorSupermercado();
            
            showToast('Local eliminado.', 'delete');
            await guardarSupermercadosEnServidor();
        }
    );
}

async function guardarSupermercadosEnServidor() {
    estaProcesandoGuardado = true;
    
    const payload = {
        codigoBarras: '__SUPERMERCADOS_DB__',
        nombre: '__SUPERMERCADOS_DB__',
        precios: JSON.stringify(supermercados),
        localActivo: localActivoPrevio || ''
    };

    try {
        if (idRegistroSupermercados) {
            await fetch(`${API_URL}/${idRegistroSupermercados}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const creado = await res.json();
                idRegistroSupermercados = String(creado.id);
            }
        }
    } catch (e) {
        console.error('Error guardando locales:', e);
    } finally {
        estaProcesandoGuardado = false;
        await sincronizarTodoDesdeServidor();
    }
}

async function guardarCarritoEnServidor() {
    estaProcesandoGuardado = true;
    try {
        const res = await fetch(API_CARRITO_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('Error al consultar carrito en MockAPI');
        const itemsRemotos = await res.json();

        const mapaRemoto = new Map();
        itemsRemotos.forEach(item => {
            const pId = String(item.productoId || item.id);
            if (pId) mapaRemoto.set(pId, String(item.id));
        });

        const idsProcesados = new Set();

        for (const item of carrito) {
            const idProducto = String(item.id);
            idsProcesados.add(idProducto);

            const payload = {
                productoId: idProducto,
                codigoBarras: String(item.codigoBarras || ''),
                nombre: item.nombre,
                precios: typeof item.precios === 'string' ? item.precios : JSON.stringify(item.precios || {}),
                cantidad: Number(item.cantidad) || 1
            };

            if (mapaRemoto.has(idProducto)) {
                const idServidorExistente = mapaRemoto.get(idProducto);
                await fetch(`${API_CARRITO_URL}/${idServidorExistente}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const resPost = await fetch(API_CARRITO_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (resPost.ok) {
                    const dataPost = await resPost.json();
                    item.idServidor = String(dataPost.id);
                }
            }
        }

        for (const [pId, servId] of mapaRemoto.entries()) {
            if (!idsProcesados.has(pId)) {
                await fetch(`${API_CARRITO_URL}/${servId}`, { method: 'DELETE' }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('Error al guardar carrito:', e);
    } finally {
        estaProcesandoGuardado = false;
    }
}

async function guardarProductoNuevo(e) {
    e.preventDefault();

    if (supermercados.length === 0) {
        showToast('Debes agregar al menos un local.', 'info');
        return;
    }

    const codigoBarras = document.getElementById('prod-codigo').value.trim();
    const nombre = formatearNombre(document.getElementById('prod-nombre').value);

    const preciosObj = {};
    supermercados.forEach(s => {
        const el = document.getElementById(`precio-${s}`);
        preciosObj[s] = (el && el.value.trim() !== '') ? (parseInt(el.value) || 0) : 0;
    });

    const payload = {
        codigoBarras,
        nombre,
        precios: JSON.stringify(preciosObj)
    };

    const btn = document.getElementById('btn-save-prod-nuevo');
    if (btn) btn.disabled = true;
    estaProcesandoGuardado = true;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error('Error al guardar');
        
        const creado = await res.json();

        const nuevoProducto = {
            id: String(creado.id),
            codigoBarras: String(creado.codigoBarras),
            nombre: creado.nombre,
            precios: preciosObj
        };

        const idxExistente = productosDB.findIndex(p => String(p.codigoBarras) === String(codigoBarras));
        if (idxExistente >= 0) {
            productosDB[idxExistente] = nuevoProducto;
        } else {
            productosDB.push(nuevoProducto);
        }

        renderizarTarjetasAdmin();
        actualizarPreciosPorSupermercado();
        document.getElementById('form-producto-nuevo').reset();

        showToast('Producto guardado.', 'add', vieneDesdeEscaner);

        if (vieneDesdeEscaner) {
            vieneDesdeEscaner = false;
            switchTab('escanner');
            abrirModalSeleccionarCantidad(nuevoProducto);
        } else {
            estaProcesandoGuardado = false;
            await sincronizarTodoDesdeServidor();
        }
    } catch (err) {
        showToast('Error al guardar producto.', 'delete', vieneDesdeEscaner);
        estaProcesandoGuardado = false;
    } finally {
        if (btn) btn.disabled = false;
    }
}

function abrirModalEditarProducto(id) {
    const stringId = String(id);
    const prod = productosDB.find(p => String(p.id) === stringId);
    if (!prod) return;

    document.getElementById('edit-prod-id').value = prod.id;
    document.getElementById('edit-prod-codigo').value = prod.codigoBarras;
    document.getElementById('edit-prod-nombre').value = prod.nombre;

    const editContainerInputs = document.getElementById('edit-inputs-precios-super');
    if (editContainerInputs) {
        editContainerInputs.innerHTML = supermercados.map(s => {
            const precioExistente = (prod.precios && prod.precios[s] !== undefined && prod.precios[s] > 0) ? prod.precios[s] : '';
            return `
                <div class="form-group" style="margin-top: 0.4rem;">
                    <label for="edit-precio-${s}">${s.toUpperCase()}:</label>
                    <input type="number" id="edit-precio-${s}" min="0" value="${precioExistente}" placeholder="0" inputmode="numeric">
                </div>
            `;
        }).join('');
    }

    const modal = document.getElementById('modal-editar-producto');
    modal.style.display = 'flex';
    
    const modalBox = modal.querySelector('.modal-box');
    if (modalBox) modalBox.scrollTop = 0;
}

function cerrarModalEditar() {
    document.getElementById('modal-editar-producto').style.display = 'none';
}

async function guardarProductoEditado(e) {
    e.preventDefault();

    const id = String(document.getElementById('edit-prod-id').value);
    const codigoBarras = document.getElementById('edit-prod-codigo').value.trim();
    const nombre = formatearNombre(document.getElementById('edit-prod-nombre').value);

    const preciosObj = {};
    supermercados.forEach(s => {
        const el = document.getElementById(`edit-precio-${s}`);
        preciosObj[s] = (el && el.value.trim() !== '') ? (parseInt(el.value) || 0) : 0;
    });

    const payload = {
        codigoBarras,
        nombre,
        precios: JSON.stringify(preciosObj)
    };

    cerrarModalEditar();
    estaProcesandoGuardado = true;

    try {
        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Producto actualizado.', 'edit');
    } catch (err) {
        console.error('Error al editar:', err);
    } finally {
        estaProcesandoGuardado = false;
        await sincronizarTodoDesdeServidor();
    }
}

function pedirEliminarProducto(id) {
    const stringId = String(id);
    const prod = productosDB.find(p => String(p.id) === stringId);
    const nombre = prod ? prod.nombre : 'este producto';

    abrirModalConfirmacion(
        `¿Estás seguro de que deseas eliminar "${nombre}"?`,
        async () => {
            estaProcesandoGuardado = true;
            try {
                await fetch(`${API_URL}/${stringId}`, { method: 'DELETE' });
                showToast('Producto eliminado.', 'delete');
            } catch (err) {
                console.error('Error al eliminar:', err);
            } finally {
                estaProcesandoGuardado = false;
                await sincronizarTodoDesdeServidor();
            }
        }
    );
}

function renderizarTarjetasAdmin() {
    const container = document.getElementById('inventory-container');
    if (!container) return;

    if (!productosDB || productosDB.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.85rem;">No hay productos guardados.</p>';
        return;
    }

    const productosOrdenados = [...productosDB].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

    container.innerHTML = productosOrdenados.map(p => {
        const localesConPrecio = supermercados.filter(s => p.precios && p.precios[s] > 0);

        return `
            <div class="inventory-card">
                <div class="inventory-card-header">
                    <div class="inventory-card-info">
                        <h4>${escapeHtml(p.nombre)}</h4>
                        <small>Código: ${escapeHtml(p.codigoBarras)}</small>
                    </div>
                    <div style="display:flex; gap:0.3rem;">
                        <button type="button" class="btn-icon btn-edit" title="Editar" onclick="abrirModalEditarProducto('${p.id}')">✏️</button>
                        <button type="button" class="btn-icon btn-delete" title="Eliminar" onclick="pedirEliminarProducto('${p.id}')">🗑️</button>
                    </div>
                </div>
                <div class="inventory-card-prices">
                    ${localesConPrecio.length > 0 ? localesConPrecio.map(s => {
                        const precioVal = p.precios[s];
                        return `
                            <div class="price-chip">
                                <span>${s.toUpperCase()}:</span>
                                <strong>$${precioVal.toLocaleString('es-CL')}</strong>
                            </div>
                        `;
                    }).join('') : '<small style="color:var(--text-muted);">Sin precios registrados.</small>'}
                </div>
            </div>
        `;
    }).join('');
}

function dictarNombre(idInput, idStatus, btnElemento) {
    const input = document.getElementById(idInput);
    const status = document.getElementById(idStatus);
    if (!input) return;

    if (dictarNombreTimeout) clearTimeout(dictarNombreTimeout);

    if (activeRecognition || micEstaEscuchando) {
        try { 
            activeRecognition.stop(); 
            activeRecognition.abort();
        } catch(e) {}
        activeRecognition = null;
        micEstaEscuchando = false;
        if (btnElemento) btnElemento.classList.remove('recording');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        if (status) status.textContent = 'Navegador no compatible con micrófono.';
        return;
    }

    const recognition = new SpeechRecognition();
    activeRecognition = recognition;

    recognition.lang = 'es-CL';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let detectoVoz = false;
    let finalTranscript = '';
    let huboError = false;

    if (btnElemento) btnElemento.classList.add('recording');
    if (status) status.textContent = 'Escuchando... habla ahora';

    recognition.onspeechstart = () => { 
        detectoVoz = true; 
    };

    recognition.onresult = (e) => {
        let texto = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            texto += e.results[i][0].transcript;
        }
        texto = texto.trim();
        if (texto.length > 0) {
            detectoVoz = true;
            texto = formatearNombre(texto);
        }
        finalTranscript = texto;
        input.value = texto;
    };

    recognition.onerror = (e) => {
        huboError = true;
        micEstaEscuchando = false;
        if (btnElemento) btnElemento.classList.remove('recording');
        
        if (status) {
            if (e.error === 'no-speech') {
                status.textContent = 'No se escuchó nada. Intenta hablar más fuerte.';
            } else {
                status.textContent = 'No se detectó voz. Intenta nuevamente.';
            }
            dictarNombreTimeout = setTimeout(() => { if (status) status.textContent = ''; }, 4000);
        }
        activeRecognition = null;
    };

    recognition.onend = () => {
        micEstaEscuchando = false;
        if (btnElemento) btnElemento.classList.remove('recording');
        
        if (!huboError && status) {
            if (finalTranscript) {
                status.textContent = `Registrado: "${finalTranscript}"`;
            } else if (detectoVoz) {
                status.textContent = 'No se escuchó nada. Intenta hablar más fuerte.';
            } else {
                status.textContent = 'No se detectó voz. Intenta nuevamente.';
            }
            dictarNombreTimeout = setTimeout(() => { if (status) status.textContent = ''; }, 4000);
        }
        activeRecognition = null;
    };

    try {
        micEstaEscuchando = true;
        recognition.start();
    } catch(err) {
        micEstaEscuchando = false;
        if (btnElemento) btnElemento.classList.remove('recording');
        if (status) status.textContent = 'No se detectó voz. Intenta nuevamente.';
        activeRecognition = null;
    }
}

function inicializarEscaner() {
    html5QrcodeScanner = new Html5Qrcode("reader");
    iniciarCamara();
}

function iniciarCamara() {
    if (camaraActiva && html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            camaraActiva = false;
            ejecutarInicioCamara();
        }).catch(() => {
            ejecutarInicioCamara();
        });
    } else {
        ejecutarInicioCamara();
    }
}

function ejecutarInicioCamara() {
    const config = { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };

    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        config, 
        onBarcodeDetected, 
        () => {}
    ).then(() => {
        camaraActiva = true;
        document.getElementById('btn-toggle-cam').innerText = 'Pausar cámara';
    }).catch(err => {
        console.warn("Cámara no iniciada:", err);
    });
}

function detenerCamara() {
    if (!camaraActiva || !html5QrcodeScanner) return;
    html5QrcodeScanner.stop().then(() => {
        camaraActiva = false;
        document.getElementById('btn-toggle-cam').innerText = 'Reactivar cámara';
    }).catch(err => console.error(err));
}

function toggleCamera() {
    if (camaraActiva) detenerCamara();
    else iniciarCamara();
}

function onBarcodeDetected(decodedText) {
    detenerCamara();
    const strCode = String(decodedText).trim();
    const prod = productosDB.find(p => String(p.codigoBarras).trim() === strCode);

    if (prod) {
        abrirModalSeleccionarCantidad(prod);
    } else {
        ultimoCodigoEscaneadoDesconocido = strCode;
        document.getElementById('modal-unk-code').innerText = strCode;
        document.getElementById('modal-no-encontrado').style.display = 'flex';
    }
}

function abrirModalSeleccionarCantidad(prod) {
    const superSel = document.getElementById('select-super').value;
    productoSeleccionadoEscaneo = prod;
    const precioUnitario = (prod.precios && superSel) ? (prod.precios[superSel] || 0) : 0;
    document.getElementById('modal-prod-nombre').innerText = prod.nombre;
    document.getElementById('modal-prod-precio').innerText = `$${precioUnitario.toLocaleString('es-CL')} c/u (${superSel ? superSel.toUpperCase() : 'N/A'})`;
    document.getElementById('modal-prod-cant').value = 1;
    document.getElementById('modal-cantidad').style.display = 'flex';
}

function modificarCantidadModal(delta) {
    const input = document.getElementById('modal-prod-cant');
    let val = parseInt(input.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    input.value = val;
}

function cerrarModalCantidad() {
    document.getElementById('modal-cantidad').style.display = 'none';
    productoSeleccionadoEscaneo = null;
    estaProcesandoGuardado = false;
    setTimeout(() => { iniciarCamara(); }, 300);
}

function cerrarModalNoEncontrado() {
    document.getElementById('modal-no-encontrado').style.display = 'none';
    setTimeout(() => { iniciarCamara(); }, 300);
}

function irARegistrarProductoNuevo() {
    vieneDesdeEscaner = true;
    cerrarModalNoEncontrado();
    switchTab('admin');
    document.getElementById('prod-codigo').value = ultimoCodigoEscaneadoDesconocido;
    document.getElementById('prod-nombre').focus();
}

async function confirmarAgregarAlCarro() {
    if (!productoSeleccionadoEscaneo) return;

    const cant = parseInt(document.getElementById('modal-prod-cant').value) || 1;
    const existe = carrito.find(item => String(item.id) === String(productoSeleccionadoEscaneo.id));

    if (existe) {
        existe.cantidad += cant;
    } else {
        carrito.push({
            id: String(productoSeleccionadoEscaneo.id),
            codigoBarras: String(productoSeleccionadoEscaneo.codigoBarras),
            nombre: productoSeleccionadoEscaneo.nombre,
            precios: productoSeleccionadoEscaneo.precios,
            cantidad: cant
        });
    }

    actualizarPreciosPorSupermercado();
    cerrarModalCantidad();

    try {
        await guardarCarritoEnServidor();
        showToast('Agregado al carrito.', 'add');
    } catch(err) {
        showToast('Error al guardarlo.', 'delete');
    } finally {
        estaProcesandoGuardado = false;
        await sincronizarTodoDesdeServidor();
    }
}

function abrirModalConfirmacion(mensaje, callback) {
    document.getElementById('modal-confirm-msg').innerText = mensaje;
    accionConfirmarCallback = callback;
    
    const btnConfirmar = document.getElementById('btn-confirm-delete');
    btnConfirmar.onclick = () => {
        if (accionConfirmarCallback) accionConfirmarCallback();
        cerrarModalConfirmacion();
    };
    
    document.getElementById('modal-confirm').style.display = 'flex';
}

function cerrarModalConfirmacion() {
    document.getElementById('modal-confirm').style.display = 'none';
    accionConfirmarCallback = null;
}

function actualizarPreciosPorSupermercado() {
    const select = document.getElementById('select-super');
    if (!select) return;

    const superSel = select.value;
    const container = document.getElementById('cart-list');
    let totalGeneral = 0;

    if (!container) return;

    if (carrito.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.85rem;">El carrito está vacío. Escanea un producto.</p>';
        document.getElementById('cart-total').innerText = '$0';
        return;
    }

    carrito.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

    container.innerHTML = carrito.map((item, index) => {
        const dbProd = productosDB.find(p => String(p.id) === String(item.id));
        const preciosRef = dbProd ? dbProd.precios : (typeof item.precios === 'string' ? JSON.parse(item.precios) : item.precios);
        const precioUnitario = (preciosRef && superSel) ? (preciosRef[superSel] || 0) : 0;
        const subtotal = precioUnitario * item.cantidad;
        totalGeneral += subtotal;

        return `
            <div class="cart-item">
                <div class="cart-item-details">
                    <span class="cart-item-title">${escapeHtml(item.nombre)}</span>
                    <span class="cart-item-price-unit">$${precioUnitario.toLocaleString('es-CL')} c/u</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <span class="qty-badge">x${item.cantidad}</span>
                    <span class="cart-item-total">$${subtotal.toLocaleString('es-CL')}</span>
                    <button type="button" class="btn-icon btn-delete" title="Eliminar" onclick="eliminarDelCarrito(${index})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('cart-total').innerText = `$${totalGeneral.toLocaleString('es-CL')}`;
}

async function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    actualizarPreciosPorSupermercado();
    showToast('Producto eliminado del carrito.', 'delete');
    
    await guardarCarritoEnServidor();
}

function pedirConfirmacionVaciarCarrito() {
    if (carrito.length === 0) return;
    abrirModalConfirmacion(
        '¿Deseas vaciar todo el carrito de compras actual?',
        async () => {
            carrito = [];
            actualizarPreciosPorSupermercado();
            showToast('Carrito vaciado.', 'delete');
            await guardarCarritoEnServidor();
        }
    );
}

function showToast(mensaje, tipo = 'add', desplazarArriba = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    if (desplazarArriba) {
        container.classList.add('toast-top-position');
    } else {
        container.classList.remove('toast-top-position');
    }

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
    } else if (tipo === 'info') { 
        icon = 'ℹ️';
        textoFinal = mensaje || 'Información.';
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
        if (container.children.length === 0) {
            container.classList.remove('toast-top-position');
        }
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}