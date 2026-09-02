function getFechaHoy() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

const API_GAS = 'https://68490b7c45f4c0f5ee6fccce.mockapi.io/api/df/gas';
let registrosGas = [];
let idGasEliminar = null;

document.addEventListener('DOMContentLoaded', cargarGas);

async function cargarGas() {
    const inputFecha = document.getElementById('fecha-gas');
    if (inputFecha && !inputFecha.value) {
        inputFecha.value = getFechaHoy();
    }

    const loading = document.getElementById('loading-gas');
    const tabla = document.getElementById('tabla-gas');

    const tbody = document.getElementById('tabla-gas-body');
    if (tbody && tbody.children.length === 0 && loading) {
        loading.style.display = 'block';
        loading.innerText = '⏳ Cargando registros de gas...';
    }

    try {
        const res = await fetch(API_GAS);
        registrosGas = await res.json();
        registrosGas.sort((a, b) => b.id - a.id);

        renderTablaGasHTML();

        if (loading) loading.style.display = 'none';
        if (tabla) tabla.style.display = 'table';
    } catch (err) {
        if (loading) loading.innerText = 'Error al cargar registros de gas ❌';
        showToast('Error al cargar registros de gas', 'delete');
    }
}

function renderTablaGasHTML() {
    const tbody = document.getElementById('tabla-gas-body');
    if (!tbody) return;

    tbody.innerHTML = registrosGas
        .map(
            (g) => `
    <tr>
        <td>${g.dia}</td>
        <td>${g.mes}</td>
        <td>${g.anio}</td>
        <td>${g.cantidad}</td>
        <td>${g.cocina ? '🔥' : ''}</td>
        <td>${g.calefon ? '🔥' : ''}</td>
        <td>
        <div class="table-actions">
            <button class="btn-icon btn-edit" onclick="abrirModalEditGas('${g.id}')">✏️</button>
            <button class="btn-icon btn-delete" onclick="pedirConfirmacionGas('${g.id}')">🗑️</button>
        </div>
        </td>
    </tr>
    `,)
        .join('');
}

function abrirModalEditGas(id) {
    const reg = registrosGas.find((g) => g.id === id);
    if (!reg) return;

    document.getElementById('edit-gas-modal-id').value = reg.id;
    document.getElementById('edit-chk-cocina').checked = reg.cocina;
    document.getElementById('edit-chk-calefon').checked = reg.calefon;

    const meses = [
        'Enero', 'Febrero','Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const mIndex = meses.indexOf(reg.mes);
    const mm = mIndex >= 0 ? String(mIndex + 1).padStart(2, '0') : '01';
    const dd = String(reg.dia).padStart(2, '0');

    document.getElementById('edit-fecha-gas').value = `${reg.anio}-${mm}-${dd}`;

    const modal = document.getElementById('modal-edit-gas');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalEditGas() {
    const modal = document.getElementById('modal-edit-gas');
    if (modal) modal.style.display = 'none';
}

async function guardarEdicionGas(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('edit-gas-modal-id').value;
    const fecha = new Date(document.getElementById('edit-fecha-gas').value);
    const cocina = document.getElementById('edit-chk-cocina').checked;
    const calefon = document.getElementById('edit-chk-calefon').checked;

    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const registroEditado = {
        dia: fecha.getDate() + 1,
        mes: meses[fecha.getMonth()],
        anio: fecha.getFullYear(),
        cantidad: (cocina ? 1 : 0) + (calefon ? 1 : 0),
        cocina: cocina,
        calefon: calefon,
    };

    const idx = registrosGas.findIndex((g) => g.id === id);
    if (idx !== -1) {
        registrosGas[idx] = { ...registrosGas[idx], ...registroEditado };
    }

    renderTablaGasHTML();
    cerrarModalEditGas();
    showToast('Registro de gas actualizado.', 'edit');

    await fetch(`${API_GAS}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registroEditado),
    });
}

async function guardarGas(e) {
    e.preventDefault();
    const fecha = new Date(document.getElementById('fecha-gas').value);
    const cocina = document.getElementById('chk-cocina').checked;
    const calefon = document.getElementById('chk-calefon').checked;

    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const nuevo = {
        dia: fecha.getDate() + 1,
        mes: meses[fecha.getMonth()],
        anio: fecha.getFullYear(),
        cantidad: (cocina ? 1 : 0) + (calefon ? 1 : 0),
        cocina: cocina,
        calefon: calefon,
    };

    const res = await fetch(API_GAS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
    });

    const creado = await res.json();
    registrosGas.unshift(creado);

    renderTablaGasHTML();
    showToast('Registro de gas guardado.', 'add');

    document.getElementById('chk-cocina').checked = false;
    document.getElementById('chk-calefon').checked = false;
    document.getElementById('fecha-gas').value = getFechaHoy();
}

function pedirConfirmacionGas(id) {
    idGasEliminar = id;
    const modal = document.getElementById('modal-confirm-gas');
    if (modal) modal.style.display = 'flex';
    document.getElementById('btn-confirm-delete-gas').onclick =
        ejecutarEliminacionGas;
}

function cerrarModalGas() {
    const modal = document.getElementById('modal-confirm-gas');
    if (modal) modal.style.display = 'none';
    idGasEliminar = null;
}

async function ejecutarEliminacionGas() {
    if (!idGasEliminar) return;

    const idABorrar = idGasEliminar;
    const scrollPos = window.scrollY;

    registrosGas = registrosGas.filter(
        (g) => String(g.id) !== String(idABorrar),
    );
    renderTablaGasHTML();
    cerrarModalGas();

    try {
        const res = await fetch(`${API_GAS}/${idABorrar}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });

        if (res.ok) {
            showToast('Registro de gas eliminado.', 'delete');
        } else {
            showToast('Error al eliminar en el servidor', 'delete');
            cargarGas();
        }
    } catch (err) {
        showToast('Error de conexión al eliminar', 'delete');
        cargarGas();
    }

    window.scrollTo(0, scrollPos);
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
