const MOCKAPI_URL = "https://6a8a52b720fcac8c1edf2740.mockapi.io/deudas";
let debtsData = [];
let alertTimeout = null;
let upcomingModalTimeout = null;
let floatingNoticeTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const navEntries = performance.getEntriesByType('navigation');
    const navType = navEntries.length > 0 ? navEntries[0].type : '';

    let tabToLoad = 'pending';

    if (navType === 'reload') {
        tabToLoad = sessionStorage.getItem('active_tab') || 'pending';
    } else {
        sessionStorage.removeItem('active_tab');
    }

    switchTab(tabToLoad);
    fetchDebts();
});

function capitalizeFirstWordOnly(input) {
    let start = input.selectionStart;
    let end = input.selectionEnd;
    let val = input.value;

    if (val.length > 0) {
        let formatted = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
        if (val !== formatted) {
            input.value = formatted;
            input.setSelectionRange(start, end);
        }
    }
}

function formatFirstLetter(str) {
    if (!str) return "";
    let clean = str.trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

let voiceStatusTimeout = null;

function startVoiceRecognition(inputId) {
    const inputEl = document.getElementById(inputId);
    const statusEl = document.getElementById(`voice-status-${inputId}`);
    if (!inputEl) return;

    if (voiceStatusTimeout) clearTimeout(voiceStatusTimeout);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = `<span class="text-red-400 font-bold"><i class="fa-solid fa-circle-xmark mr-1"></i>Navegador no compatible con dictado de voz.</span>`;
        }
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL'; 
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    let hasHeardSpeech = false;
    let finalTranscript = '';

    if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `
            <div class="flex items-center gap-2 text-blue-400 font-bold animate-pulse">
                <i class="fa-solid fa-microphone"></i>
                <span>Escuchando... habla ahora</span>
            </div>
        `;
    }

    recognition.onspeechstart = () => {
        hasHeardSpeech = true;
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        transcript = transcript.replace(/\.$/, '').trim();

        if (transcript.length > 0) {
            transcript = formatFirstLetter(transcript);
        }

        finalTranscript = transcript;
        inputEl.value = transcript;
    };

    recognition.onerror = (event) => {
        console.error("Error reconocimiento voz:", event.error);
        
        if (statusEl) {
            statusEl.classList.remove('hidden');
            if (event.error === 'no-speech') {
                statusEl.innerHTML = `<span class="text-amber-400 font-bold"><i class="fa-solid fa-microphone-slash mr-1"></i>No se escuchó nada. Intenta hablar más fuerte.</span>`;
            } else {
                statusEl.innerHTML = `<span class="text-red-400 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Error en el micrófono (${event.error}).</span>`;
            }

            voiceStatusTimeout = setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 4000);
        }
    };

    recognition.onend = () => {
        if (!statusEl) return;

        if (finalTranscript) {
            statusEl.innerHTML = `
                <div class="text-[11px] text-zinc-300">
                    <b class="text-emerald-400"><i class="fa-solid fa-circle-check mr-1"></i>Registro escuchado:</b> "${finalTranscript}"
                </div>
            `;
            voiceStatusTimeout = setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 4000);
        } else if (!hasHeardSpeech) {
            statusEl.innerHTML = `<span class="text-amber-400 font-bold"><i class="fa-solid fa-microphone-slash mr-1"></i>No se detectó voz. Intenta nuevamente.</span>`;
            voiceStatusTimeout = setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 4000);
        }
    };

    recognition.start();
}

function formatTotalAmountInput(input) {
    let cleanValue = input.value.replace(/\D/g, '');
    if (!cleanValue) {
        input.value = '';
        return;
    }
    input.value = new Intl.NumberFormat('es-CL').format(cleanValue);
    if (input.id === 'input-total-amount') {
        autoDistributeAmount();
    }
}

function formatDateCL(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    let dueDate;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        dueDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    } else {
        const parts = dateStr.split('-');
        dueDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    dueDate.setHours(0, 0, 0, 0);
    return isNaN(dueDate.getTime()) ? null : dueDate;
}

function closeUpcomingModal() {
    if (upcomingModalTimeout) clearTimeout(upcomingModalTimeout);
    const modal = document.getElementById('upcoming-alerts-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function checkUpcomingDueDates() {
    const today = new Date();
    const currentHour = today.getHours();
    
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateFormatted = `${day}/${month}/${year}`;

    const alertKey = `alert_${dateFormatted}_${currentHour}h`;

    today.setHours(0, 0, 0, 0);
    const container = document.getElementById('upcoming-alerts-list');
    const modal = document.getElementById('upcoming-alerts-modal');
    if (!container || !modal) return;
    
    container.innerHTML = '';
    let alertsList = [];

    if (!Array.isArray(debtsData)) return;

    debtsData.forEach(debt => {
        if (!debt.installments) return;

        debt.installments.forEach(inst => {
            if (!inst.paid && inst.date) {
                let dueDate = parseDate(inst.date);
                if (!dueDate || isNaN(dueDate.getTime())) return;

                dueDate.setHours(0, 0, 0, 0);
                const diffTime = dueDate.getTime() - today.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 7) {
                    let priority = 3;
                    let styleConfig = {};
                    let statusText = '';

                    if (diffDays < 0) {
                        priority = 1;
                        statusText = `VENCIDA HACE ${Math.abs(diffDays)} D`;
                        styleConfig = {
                            bg: 'bg-red-500/10 border-red-500/30',
                            badgeBg: 'bg-red-500/20 text-red-400 border-red-500/40',
                            tagBg: 'bg-red-500/15 text-red-400 border-red-500/30',
                            icon: 'fa-triangle-exclamation text-red-400',
                            textColor: 'text-red-400'
                        };
                    } else if (diffDays <= 3) {
                        priority = 2;
                        statusText = diffDays === 0 ? '¡VENCE HOY!' : `VENCE EN ${diffDays} D`;
                        styleConfig = {
                            bg: 'bg-amber-500/10 border-amber-500/30',
                            badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                            tagBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                            icon: 'fa-clock text-amber-400',
                            textColor: 'text-amber-300'
                        };
                    } else {
                        priority = 3;
                        statusText = `VENCE EN ${diffDays} D`;
                        styleConfig = {
                            bg: 'bg-blue-500/10 border-blue-500/30',
                            badgeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
                            tagBg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                            icon: 'fa-calendar-day text-blue-400',
                            textColor: 'text-blue-400'
                        };
                    }

                    alertsList.push({ priority, diffDays, debt, inst, styleConfig, statusText });
                }
            }
        });
    });

    alertsList.sort((a, b) => a.priority - b.priority || a.diffDays - b.diffDays);

    alertsList.forEach(item => {
        const creditorBadge = `<span class="${item.styleConfig.tagBg} border px-2.5 py-1 rounded-full font-extrabold text-xs shadow-sm">${item.debt.creditor}</span>`;
        const typeBadge = item.debt.type ? `<span class="${item.styleConfig.tagBg} border px-2.5 py-1 rounded-full font-extrabold text-xs shadow-sm">${item.debt.type}</span>` : '';
        
        const card = document.createElement('div');
        card.className = `p-3 rounded-xl border ${item.styleConfig.bg} transition flex items-center justify-between text-xs gap-2 shadow-sm`;
        
        card.innerHTML = `
            <div class="flex items-center space-x-3">
                <i class="fa-solid ${item.styleConfig.icon} text-base"></i>
                <div>
                    <div class="flex items-center flex-wrap gap-1.5 mb-1">
                        ${creditorBadge}
                        ${typeBadge}
                    </div>
                    <p class="text-xs ${item.styleConfig.textColor} font-bold">
                        Cuota ${item.inst.number} • $${Number(item.inst.amount).toLocaleString('es-CL')}
                    </p>
                </div>
            </div>
            <span class="text-[10px] font-black tracking-wider px-2.5 py-1 rounded-lg border whitespace-nowrap shadow-sm uppercase ${item.styleConfig.badgeBg}">
                ${item.statusText}
            </span>
        `;
        container.appendChild(card);
    });

    if (alertsList.length > 0) {
        const infoFooter = document.createElement('div');
        infoFooter.className = 'mt-2 text-center text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5 pt-2 border-t border-slate-700/40';
        infoFooter.innerHTML = `
            <i class="fa-solid fa-circle-info text-blue-400"></i>
            <span>Esta ventana emergente se muestra máximo <b>1 vez por hora</b>.</span>
        `;
        container.appendChild(infoFooter);
    }

    const alreadyShown = localStorage.getItem(alertKey);

    if (alertsList.length > 0 && !alreadyShown) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        localStorage.setItem(alertKey, 'true');

        if (typeof upcomingModalTimeout !== 'undefined' && upcomingModalTimeout) {
            clearTimeout(upcomingModalTimeout);
        }
        upcomingModalTimeout = setTimeout(() => {
            closeUpcomingModal();
        }, 35000);
    }
}

function showAlert(title, message, type = 'success', onConfirm = null) {
    if (alertTimeout) clearTimeout(alertTimeout);

    const modal = document.getElementById('custom-alert-modal');
    const iconContainer = document.getElementById('alert-icon-container');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const buttonsContainer = document.getElementById('alert-buttons');

    if (!modal || !iconContainer || !titleEl || !msgEl || !buttonsContainer) return;

    titleEl.innerText = title;
    msgEl.innerText = message;
    buttonsContainer.innerHTML = '';

    if (type === 'danger') {
        iconContainer.className = "mx-auto w-12 h-12 rounded-full flex items-center justify-center text-2xl alert-icon-danger";
        iconContainer.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        
        if (onConfirm) {
            buttonsContainer.innerHTML = `
                <button onclick="closeAlertModal()" class="px-4 py-2 bg-zinc-200 text-zinc-800 text-xs font-bold rounded-lg hover:bg-zinc-300 transition">Cancelar</button>
                <button id="alert-confirm-btn" class="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 transition">Eliminar</button>
            `;
            document.getElementById('alert-confirm-btn').onclick = () => {
                closeAlertModal();
                onConfirm();
            };
        }
    } else if (type === 'info') {
        iconContainer.className = "mx-auto w-12 h-12 rounded-full flex items-center justify-center text-2xl alert-icon-info";
        iconContainer.innerHTML = '<i class="fa-solid fa-rotate text-blue-600"></i>';
    } else {
        iconContainer.className = "mx-auto w-12 h-12 rounded-full flex items-center justify-center text-2xl alert-icon-success";
        iconContainer.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i>';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (!onConfirm) {
        alertTimeout = setTimeout(() => {
            closeAlertModal();
        }, 3000);
    }
}

function closeAlertModal() {
    if (alertTimeout) clearTimeout(alertTimeout);
    const modal = document.getElementById('custom-alert-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function switchTab(tab) {
    const pendingTab = document.getElementById('tab-pending');
    const pendingListTab = document.getElementById('tab-pending-list');
    const historyTab = document.getElementById('tab-history');

    const pendingBtn = document.getElementById('tab-pending-btn');
    const pendingListBtn = document.getElementById('tab-pending-list-btn');
    const historyBtn = document.getElementById('tab-history-btn');

    if (!pendingTab || !pendingListTab || !historyTab) return;

    pendingTab.classList.add('hidden');
    pendingListTab.classList.add('hidden');
    historyTab.classList.add('hidden');

    const baseClass = "text-zinc-400 hover:text-white px-3 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2 whitespace-nowrap focus:outline-none transition";
    if (pendingBtn) pendingBtn.className = baseClass;
    if (pendingListBtn) pendingListBtn.className = baseClass;
    if (historyBtn) historyBtn.className = baseClass;

    const activeClass = "tab-active px-3 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2 whitespace-nowrap focus:outline-none transition";

    if (tab === 'pending') {
        pendingTab.classList.remove('hidden');
        if (pendingBtn) pendingBtn.className = activeClass;
    } else if (tab === 'pending-list') {
        pendingListTab.classList.remove('hidden');
        if (pendingListBtn) pendingListBtn.className = activeClass;
    } else {
        historyTab.classList.remove('hidden');
        if (historyBtn) historyBtn.className = activeClass;
    }

    sessionStorage.setItem('active_tab', tab);
}

async function fetchDebts() {
    try {
        const res = await fetch(MOCKAPI_URL);
        if (!res.ok) throw new Error("Error al consultar API");
        const rawData = await res.json();
        
        debtsData = rawData.map(item => ({
            id: item.id,
            creditor: formatFirstLetter(item.acreedor),
            type: formatFirstLetter(item.tipo),
            installments: Array.isArray(item.cuotas) ? item.cuotas : []
        }));

        renderApp();
        checkUpcomingDueDates();
    } catch (err) {
        console.error("Error al cargar deudas.", err);
    }
}

async function saveDebtItem(debt) {
    const payload = {
        acreedor: formatFirstLetter(debt.creditor),
        tipo: formatFirstLetter(debt.type),
        cuotas: debt.installments
    };

    try {
        if (debt.id) {
            await fetch(`${MOCKAPI_URL}/${debt.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        } else {
            await fetch(MOCKAPI_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        }
        await fetchDebts();
    } catch (err) {
        console.error("Error al guardar.", err);
        showAlert("Error", "Ocurrió un problema al conectar con el servidor.", "danger");
    }
}

function deleteDebtFromStorage(id, silent = false) {
    const executeDelete = async () => {
        try { 
            await fetch(`${MOCKAPI_URL}/${id}`, { method: 'DELETE' }); 
            await fetchDebts();
            if (!silent) {
                showAlert("¡Deuda eliminada!", "La deuda se ha eliminado por completo.", "danger");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (silent) {
        executeDelete();
    } else {
        showAlert("¿Eliminar deuda?", "Esta acción borra por completo la deuda.", "danger", executeDelete);
    }
}

function getNextDueDate(debt) {
    const pendingInsts = debt.installments.filter(i => !i.paid && i.date);
    if (pendingInsts.length === 0) return new Date(8640000000000000);
    
    let earliest = new Date(8640000000000000);
    pendingInsts.forEach(i => {
        const d = parseDate(i.date);
        if (d && d < earliest) earliest = d;
    });
    return earliest;
}

function renderApp() {
    const loadingState = document.getElementById('loading-state');
    if (loadingState) {
        loadingState.classList.add('hidden');
    }

    const containerPending = document.getElementById('debts-container');
    const containerPendingTable = document.getElementById('pending-table-body');
    const containerPendingMobile = document.getElementById('pending-mobile-container');
    
    const containerHistory = document.getElementById('history-table-body');
    const containerHistoryMobile = document.getElementById('history-mobile-container');

    const emptyPending = document.getElementById('empty-pending-state');
    const emptyPendingList = document.getElementById('empty-pending-list-state');
    const emptyHistory = document.getElementById('empty-history-state');

    if (containerPending) containerPending.innerHTML = '';
    if (containerPendingTable) containerPendingTable.innerHTML = '';
    if (containerPendingMobile) containerPendingMobile.innerHTML = '';
    if (containerHistory) containerHistory.innerHTML = '';
    if (containerHistoryMobile) containerHistoryMobile.innerHTML = '';

    let countPending = 0;
    let countHistory = 0;

    const sortedDebts = [...debtsData].sort((a, b) => getNextDueDate(a) - getNextDueDate(b));

    sortedDebts.forEach(debt => {
        const totalInstallments = debt.installments.length;
        const paidInstallments = debt.installments.filter(i => i.paid).length;
        const isCompleted = totalInstallments > 0 && paidInstallments === totalInstallments;

        if (!isCompleted) {
            countPending++;
            if (containerPending) containerPending.appendChild(createDebtCard(debt));
            if (containerPendingTable) containerPendingTable.appendChild(createPendingRow(debt));
            if (containerPendingMobile) containerPendingMobile.appendChild(createPendingMobileCard(debt));
        } else {
            countHistory++;
            if (containerHistory) containerHistory.appendChild(createHistoryRow(debt));
            if (containerHistoryMobile) containerHistoryMobile.appendChild(createHistoryMobileCard(debt));
        }
    });

    if (document.getElementById('badge-pending')) document.getElementById('badge-pending').innerText = countPending;
    if (document.getElementById('badge-pending-list')) document.getElementById('badge-pending-list').innerText = countPending;
    if (document.getElementById('badge-history')) document.getElementById('badge-history').innerText = countHistory;

    if (emptyPending) emptyPending.classList.toggle('hidden', countPending > 0);
    if (emptyPendingList) emptyPendingList.classList.toggle('hidden', countPending > 0);
    if (emptyHistory) emptyHistory.classList.toggle('hidden', countHistory > 0);
}

function createDebtCard(debt) {
    const totalCount = debt.installments.length;
    const paidCount = debt.installments.filter(i => i.paid).length;
    
    const pendingInstallments = debt.installments
        .map((inst, originalIndex) => ({ ...inst, originalIndex }))
        .filter(inst => !inst.paid);

    const paidInstallments = debt.installments
            .map((inst, originalIndex) => ({ ...inst, originalIndex }))
            .filter(inst => inst.paid);

    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const remainingAmount = pendingInstallments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    const card = document.createElement('div');
    card.className = "bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 p-4 sm:p-5 space-y-4 relative flex flex-col justify-between hover:border-zinc-700 transition";

    let pendingHtml = pendingInstallments.map((inst) => `
        <div class="flex items-center justify-between p-2 sm:p-2.5 bg-zinc-950 hover:bg-zinc-800/60 rounded-xl border border-zinc-800 transition">
            <div class="flex items-center space-x-2.5 sm:space-x-3">
                <button onclick="togglePayInstallment('${debt.id}', ${inst.originalIndex})" class="w-6 h-6 rounded-md border border-red-500/50 hover:border-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition" title="Marcar como pagada">
                    <i class="fa-solid fa-check text-xs text-transparent hover:text-emerald-400"></i>
                </button>
                <div>
                    <p class="text-xs font-bold text-white">Cuota N° ${inst.number}</p>
                    <p class="text-[10px] sm:text-[11px] text-blue-400 font-medium"><i class="fa-regular fa-calendar text-blue-400 mr-1"></i>${formatDateCL(inst.date)}</p>
                </div>
            </div>
            <div class="flex items-center space-x-1.5 sm:space-x-2">
                <span class="text-xs sm:text-sm font-extrabold text-white mr-1">$${Number(inst.amount).toLocaleString('es-CL')}</span>
                <button onclick="openEditInstallmentModal('${debt.id}', ${inst.originalIndex})" class="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition" title="Editar cuota">
                    <i class="fa-solid fa-pen text-xs"></i>
                </button>
                <button onclick="deleteSingleInstallment('${debt.id}', ${inst.originalIndex})" class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition" title="Eliminar cuota">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>
    `).join('');

    const paidHistoryHtml = paidInstallments.slice()
            .reverse()
            .map((inst) => `
                <div class="flex items-center justify-between p-2 bg-emerald-950/30 rounded-lg border border-emerald-900/50 text-xs">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-circle-check text-emerald-400 text-xs"></i>
                        <span class="font-semibold text-zinc-300">Cuota N° ${inst.number}</span>
                        <span class="text-[10px] text-zinc-500">(${formatDateCL(inst.date)})</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-emerald-400">$${Number(inst.amount).toLocaleString('es-CL')}</span>
                        <button onclick="togglePayInstallment('${debt.id}', ${inst.originalIndex})" class="p-1.5 text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded transition" title="Desmarcar">
                            <i class="fa-solid fa-clock-rotate-left text-xs text-pink-400"></i>
                        </button>
                    </div>
                </div>
            `).join('');

    const creditorBadge = `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg font-bold text-xs">${debt.creditor}</span>`;
    const typeBadge = debt.type ? `<span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg font-bold text-xs">${debt.type}</span>` : '';

    const hasPaidInstallments = paidInstallments.length > 0;

    card.innerHTML = `
        <div>
            <div class="flex justify-between items-start mb-3 gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${creditorBadge}
                    ${typeBadge}
                    <button onclick="openEditDebtInfoModal('${debt.id}')" class="text-zinc-400 hover:text-blue-400 transition" title="Editar acreedor/tipo">
                        <i class="fa-solid fa-pen-to-square text-xs"></i>
                    </button>
                </div>
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg border whitespace-nowrap bg-amber-500/10 text-amber-300 border-amber-500/30">
                    Cuota ${paidCount} de ${totalCount}
                </span>
            </div>
            <div class="bg-zinc-950 p-3 rounded-xl border border-zinc-800 mb-4 flex justify-between items-center text-xs">
                <div>
                    <p class="text-zinc-400 font-medium">Pendiente total:</p>
                    <p class="text-sm sm:text-base font-black text-amber-400">$${remainingAmount.toLocaleString('es-CL')}</p>
                </div>
                <div class="text-right">
                    <p class="text-zinc-400 font-medium flex items-center justify-end gap-1">
                        <button onclick="openEditTotalAmountModal('${debt.id}')" class="text-zinc-400 hover:text-blue-400 transition" title="Editar monto total">
                            <i class="fa-solid fa-pen text-[11px]"></i>
                        </button>
                        <span>Monto total:</span>
                    </p>
                    <p class="font-bold text-white">$${totalAmount.toLocaleString('es-CL')}</p>
                </div>
            </div>

            <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                <div class="flex justify-between items-center mb-1">
                    <p class="text-[11px] sm:text-xs font-bold text-zinc-300 uppercase tracking-wider">Cuotas por pagar (${pendingInstallments.length}):</p>
                    <button onclick="openAddSingleInstallmentModal('${debt.id}')" class="text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-600 hover:text-white transition">+ Añadir cuota</button>
                </div>
                ${pendingHtml || '<p class="text-xs text-zinc-500 italic text-center py-2">Sin cuotas pendientes.</p>'}
            </div>

            <details class="mt-3 pt-2 border-t border-zinc-800/80 group ${!hasPaidInstallments ? 'opacity-40 pointer-events-none' : ''}">
                <summary class="cursor-pointer text-[11px] font-bold ${hasPaidInstallments ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-500'} flex items-center justify-between select-none">
                    <span><i class="fa-solid fa-history mr-1"></i> Ver cuotas pagadas (${paidInstallments.length})</span>
                    <i class="fa-solid fa-chevron-down text-xs transition-transform group-open:rotate-180"></i>
                </summary>
                ${hasPaidInstallments ? `
                    <div class="space-y-1.5 mt-2 max-h-36 overflow-y-auto pr-1">
                        ${paidHistoryHtml}
                    </div>
                ` : ''}
            </details>
        </div>

        <div class="pt-3 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-300 mt-3">
            <span><strong>${paidCount}</strong> de <strong>${totalCount}</strong> cuotas pagadas</span>
            <button onclick="deleteDebtFromStorage('${debt.id}')" class="text-red-400 hover:text-red-300 font-bold transition flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-500/10">
                <i class="fa-solid fa-trash-can text-xs"></i> Eliminar deuda
            </button>
        </div>
    `;
    return card;
}

function openInstallmentsModal(debtId) {
    const debt = debtsData.find(d => d.id === debtId);
    if (!debt) return;

    let existingModal = document.getElementById('floating-installments-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'floating-installments-modal';
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4';

    const filteredInstallments = debt.installments
        .map((inst, originalIndex) => ({ ...inst, originalIndex }))
        .filter(inst => inst.paid);

    const totalPaid = filteredInstallments.length;

    const installmentsList = filteredInstallments.map((inst) => `
        <div class="flex items-center justify-between p-2.5 bg-emerald-950/20 border-emerald-900/40 rounded-xl border transition gap-2">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400 text-xs"></i>
                <div>
                    <p class="text-xs font-bold text-emerald-400">Cuota N° ${inst.number}</p>
                    <p class="text-[10px] text-zinc-400">${formatDateCL(inst.date)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs font-black text-emerald-400">$${Number(inst.amount).toLocaleString('es-CL')}</span>
                <button onclick="handleUnmarkWithAutoClose('${debt.id}', ${inst.originalIndex}, ${totalPaid})" class="p-1.5 text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded transition" title="Desmarcar">
                    <i class="fa-solid fa-clock-rotate-left text-xs text-pink-400"></i>
                </button>
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative flex flex-col max-h-[85vh]">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 mb-2">
                <div class="flex items-center gap-2">
                    <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg font-bold text-xs">${debt.creditor}</span>
                    ${debt.type ? `<span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg font-bold text-xs">${debt.type}</span>` : ''}
                </div>
                <button onclick="document.getElementById('floating-installments-modal').remove()" class="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>

            <div id="floating-modal-notice" class="hidden my-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                <i class="fa-solid fa-circle-check"></i>
                <span>Cuota desmarcada y devuelta a pendiente correctamente.</span>
            </div>

            <div class="space-y-2 overflow-y-auto pr-1 flex-1 mt-2">
                ${installmentsList || `<p class="text-xs text-zinc-500 text-center py-4 italic">No hay cuotas pagadas en esta deuda.</p>`}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function handleUnmarkWithAutoClose(debtId, index, totalPaidCount) {
    togglePayInstallment(debtId, index, true);

    const notice = document.getElementById('floating-modal-notice');
    if (notice) notice.classList.remove('hidden');

    if (totalPaidCount === 1) {
        setTimeout(() => {
            const modal = document.getElementById('floating-installments-modal');
            if (modal) modal.remove();
        }, 5000); 
    }
}

function generateActionsDetails(debt) {
    const hasPaidInstallments = debt.installments.some(i => i.paid);
    
    return `
        <div class="flex items-center justify-center gap-2">
            <button 
                onclick="${hasPaidInstallments ? `openInstallmentsModal('${debt.id}')` : ''}" 
                class="p-2 transition rounded-lg ${hasPaidInstallments ? 'text-pink-400 hover:text-pink-300 hover:bg-pink-500/10' : 'text-zinc-600 opacity-40 cursor-not-allowed'}" 
                title="${hasPaidInstallments ? 'Ver cuotas pagadas' : 'Sin cuotas pagadas'}"
                ${!hasPaidInstallments ? 'disabled' : ''}
            >
                <i class="fa-solid fa-clock-rotate-left text-base text-pink-400"></i>
            </button>
            <button onclick="deleteDebtFromStorage('${debt.id}')" class="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition" title="Eliminar deuda">
                <i class="fa-solid fa-trash-can text-base"></i>
            </button>
        </div>
    `;
}

function createPendingRow(debt) {
    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const remainingAmount = debt.installments.filter(i => !i.paid).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalInstallments = debt.installments.length;
    const paidInstallments = debt.installments.filter(i => i.paid).length;

    const tr = document.createElement('tr');
    tr.className = "hover:bg-zinc-800/40 transition border-b border-zinc-800 text-white";
    tr.innerHTML = `
        <td class="p-3 sm:p-4"><span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.type || 'N/A'}</span></td>
        <td class="p-3 sm:p-4">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-clock text-amber-400 text-sm"></i>
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.creditor}</span>
            </div>
        </td>
        <td class="p-3 sm:p-4 text-center font-bold text-zinc-300">${paidInstallments} de ${totalInstallments}</td>
        <td class="p-3 sm:p-4 text-right font-black text-amber-400">$${remainingAmount.toLocaleString('es-CL')}</td>
        <td class="p-3 sm:p-4 text-right font-bold text-white">$${totalAmount.toLocaleString('es-CL')}</td>
        <td class="p-3 sm:p-4 text-center">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">PENDIENTE</span>
        </td>
        <td class="p-3 sm:p-4 text-center">
            ${generateActionsDetails(debt)}
        </td>
    `;
    return tr;
}

function createPendingMobileCard(debt) {
    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const remainingAmount = debt.installments.filter(i => !i.paid).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalInstallments = debt.installments.length;
    const paidInstallments = debt.installments.filter(i => i.paid).length;

    const div = document.createElement('div');
    div.className = "bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2 text-xs mb-3";
    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-1.5 flex-wrap">
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.creditor}</span>
                ${debt.type ? `<span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.type}</span>` : ''}
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">PENDIENTE</span>
        </div>
        <div class="grid grid-cols-2 gap-2 bg-zinc-900 p-2 rounded-lg border border-zinc-800/80">
            <div>
                <p class="text-zinc-500 text-[10px]">Progreso</p>
                <p class="font-bold text-zinc-200">${paidInstallments} / ${totalInstallments} cuotas</p>
            </div>
            <div class="text-right">
                <p class="text-zinc-500 text-[10px]">Pendiente</p>
                <p class="font-black text-amber-400">$${remainingAmount.toLocaleString('es-CL')}</p>
            </div>
        </div>
        <div class="pt-2 border-t border-zinc-800 flex justify-between items-center">
            <p class="text-zinc-400">Total: <strong class="text-white">$${totalAmount.toLocaleString('es-CL')}</strong></p>
            ${generateActionsDetails(debt)}
        </div>
    `;
    return div;
}

function createHistoryRow(debt) {
    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalInstallments = debt.installments.length;
    const lastDate = debt.installments[debt.installments.length - 1]?.date || 'Completado';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-zinc-800/40 transition border-b border-zinc-800 text-white";
    tr.innerHTML = `
        <td class="p-3 sm:p-4"><span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.type || 'N/A'}</span></td>
        <td class="p-3 sm:p-4">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i>
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.creditor}</span>
            </div>
        </td>
        <td class="p-3 sm:p-4 text-center font-bold text-zinc-300">${totalInstallments} de ${totalInstallments}</td>
        <td class="p-3 sm:p-4 text-right font-black text-emerald-400">$${totalAmount.toLocaleString('es-CL')}</td>
        <td class="p-3 sm:p-4 text-center text-xs text-zinc-300"><i class="fa-regular fa-calendar text-emerald-400 mr-1"></i>${formatDateCL(lastDate)}</td>
        <td class="p-3 sm:p-4 text-center">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">PAGADO</span>
        </td>
        <td class="p-3 sm:p-4 text-center">
            ${generateActionsDetails(debt)}
        </td>
    `;
    return tr;
}

function createHistoryMobileCard(debt) {
    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalInstallments = debt.installments.length;
    const lastDate = debt.installments[debt.installments.length - 1]?.date || 'Completado';

    const div = document.createElement('div');
    div.className = "bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2 text-xs mb-3";
    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-1.5 flex-wrap">
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.creditor}</span>
                ${debt.type ? `<span class="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-bold text-xs">${debt.type}</span>` : ''}
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">PAGADO</span>
        </div>
        <div class="grid grid-cols-2 gap-2 bg-zinc-900 p-2 rounded-lg border border-zinc-800/80">
            <div>
                <p class="text-zinc-500 text-[10px]">Cuotas pagadas</p>
                <p class="font-bold text-zinc-200">${totalInstallments} de ${totalInstallments}</p>
            </div>
            <div class="text-right">
                <p class="text-zinc-500 text-[10px]">Fecha de término</p>
                <p class="font-bold text-emerald-400">${formatDateCL(lastDate)}</p>
            </div>
        </div>
        <div class="pt-2 border-t border-zinc-800 flex justify-between items-center">
            <p class="text-zinc-400">Total pagado: <strong class="text-white">$${totalAmount.toLocaleString('es-CL')}</strong></p>
            ${generateActionsDetails(debt)}
        </div>
    `;
    return div;
}

async function togglePayInstallment(debtId, index, keepModalOpen = false) {
    const debt = debtsData.find(d => d.id === debtId);
    if (!debt) return;
    
    debt.installments[index].paid = !debt.installments[index].paid;
    const allPaid = debt.installments.every(i => i.paid);
    
    await saveDebtItem(debt);

    if (keepModalOpen) {
        openInstallmentsModal(debtId);
        
        const noticeEl = document.getElementById('floating-modal-notice');
        if (noticeEl) {
            noticeEl.classList.remove('hidden');
            if (floatingNoticeTimeout) clearTimeout(floatingNoticeTimeout);
            floatingNoticeTimeout = setTimeout(() => {
                if (noticeEl) noticeEl.classList.add('hidden');
            }, 5000);
        }
    } else {
        if (allPaid) {
            showAlert(
                "¡Deuda completada!", 
                `La deuda ha sido pagada en su totalidad y pasó al historial de deudas pagadas.`, 
                "success"
            );
        } else {
            showAlert("¡Actualizado!", "Se ha modificado el registro de la cuota.", "success");
        }
    }
}

function openEditDebtInfoModal(debtId) {
    const debt = debtsData.find(d => d.id === debtId);
    if (!debt) return;

    document.getElementById('edit-debt-info-id').value = debtId;
    document.getElementById('edit-debt-info-creditor').value = formatFirstLetter(debt.creditor);
    document.getElementById('edit-debt-info-type').value = formatFirstLetter(debt.type);

    document.getElementById('modal-edit-debt-info').classList.remove('hidden');
    document.getElementById('modal-edit-debt-info').classList.add('flex');
}

async function handleSaveEditedDebtInfo(e) {
    e.preventDefault();
    const debtId = document.getElementById('edit-debt-info-id').value;
    const creditor = formatFirstLetter(document.getElementById('edit-debt-info-creditor').value);
    const type = formatFirstLetter(document.getElementById('edit-debt-info-type').value);

    const debt = debtsData.find(d => d.id === debtId);
    if (debt) {
        debt.creditor = creditor;
        debt.type = type;
        await saveDebtItem(debt);
        closeModal('modal-edit-debt-info');
        showAlert("¡Actualizado!", "Se han modificado los datos de la deuda.", "success");
    }
}

function openEditTotalAmountModal(debtId) {
    const debt = debtsData.find(d => d.id === debtId);
    if (!debt) return;

    const totalAmount = debt.installments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    document.getElementById('edit-total-debt-id').value = debtId;
    document.getElementById('edit-total-amount-input').value = new Intl.NumberFormat('es-CL').format(totalAmount);

    document.getElementById('modal-edit-total-amount').classList.remove('hidden');
    document.getElementById('modal-edit-total-amount').classList.add('flex');
}

function handleSaveEditedTotalAmount(recalculateAll = false) {
    const debtId = document.getElementById('edit-total-debt-id').value;
    const rawVal = document.getElementById('edit-total-amount-input').value.replace(/\./g, '');
    const newTotal = parseFloat(rawVal) || 0;

    const debt = debtsData.find(d => d.id === debtId);
    if (!debt || debt.installments.length === 0) return;

    const count = debt.installments.length;

    if (recalculateAll) {
        const baseAmount = Math.floor(newTotal / count);
        const remainder = newTotal - (baseAmount * count);

        debt.installments.forEach((inst, i) => {
            inst.amount = (i === count - 1) ? baseAmount + remainder : baseAmount;
        });
    } else {
        const currentSumExceptLast = debt.installments
            .slice(0, count - 1)
            .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

        const newLastAmount = newTotal - currentSumExceptLast;
        debt.installments[count - 1].amount = Math.max(0, newLastAmount);
    }

    closeModal('modal-edit-total-amount');
    showAlert("¡Actualizado!", "Se ha modificado el monto total.", "success");
    saveDebtItem(debt);
}

function deleteSingleInstallment(debtId, index) {
    showAlert("¿Eliminar cuota?", "Se borrará esta cuota de la deuda.", "danger", async () => {
        const debt = debtsData.find(d => d.id === debtId);
        if (!debt) return;
        
        debt.installments.splice(index, 1);

        if (debt.installments.length === 0) {
            deleteDebtFromStorage(debtId, true);
            showAlert("¡Deuda eliminada!", "Al borrar la única cuota, la deuda se eliminó por completo.", "danger");
            return;
        }

        debt.installments.forEach((inst, i) => inst.number = i + 1);

        const allRemainingArePaid = debt.installments.every(i => i.paid);

        await saveDebtItem(debt);

        if (allRemainingArePaid) {
            showAlert(
                "¡Deuda completada!", 
                `Al no quedar cuotas pendientes, la deuda se completó y pasó al historial de deudas pagadas.`, 
                "success"
            );
        } else {

            showAlert("¡Cuota eliminada!", "Se ha modificado el registro de cuotas.", "danger");
        }
    });
}

function openAddSingleInstallmentModal(debtId) {
    document.getElementById('add-single-debt-id').value = debtId;
    document.getElementById('add-single-amount').value = '';
    document.getElementById('add-single-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('modal-add-single-installment').classList.remove('hidden');
    document.getElementById('modal-add-single-installment').classList.add('flex');
}

async function handleAddSingleInstallment(e) {
    e.preventDefault();
    const debtId = document.getElementById('add-single-debt-id').value;
    const rawVal = document.getElementById('add-single-amount').value.replace(/\./g, '');
    const amount = parseFloat(rawVal) || 0;
    const date = document.getElementById('add-single-date').value;

    const debt = debtsData.find(d => d.id === debtId);
    if (debt) {
        debt.installments.push({
            number: debt.installments.length + 1,
            amount: amount,
            date: date,
            paid: false
        });
        await saveDebtItem(debt);
        closeModal('modal-add-single-installment');
        showAlert("¡Cuota añadida!", "Se ha registrado la nueva cuota.", "success");
    }
}

function generateInstallmentInputs() {
    const count = parseInt(document.getElementById('input-installments-count').value) || 1;
    const container = document.getElementById('installments-custom-container');
    if (!container) return;
    
    container.innerHTML = '';
    const today = new Date();

    for (let i = 1; i <= count; i++) {
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + (i - 1), today.getDate());
        const defaultDate = nextMonth.toISOString().split('T')[0];

        const onChangeAttr = (i === 1) ? 'onchange="autoPropagateFirstDate()"' : '';

        const row = document.createElement('div');
        row.className = "p-2 bg-white rounded-lg border border-zinc-200 text-xs shadow-sm space-y-1.5";
        
        row.innerHTML = `
            <div class="flex items-center justify-between text-[11px] font-bold text-zinc-600 border-b border-zinc-100 pb-1">
                <span>Cuota ${i}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div class="sm:col-span-4">
                    <input type="text" placeholder="Monto ($)" id="inst-amount-${i}" oninput="formatTotalAmountInput(this)" class="w-full px-2 py-1 bg-zinc-50 border border-zinc-300 rounded text-xs text-zinc-900 outline-none focus:border-blue-500 font-bold">
                </div>
                <div class="sm:col-span-5">
                    <input type="date" value="${defaultDate}" id="inst-date-${i}" ${onChangeAttr} required class="w-full px-2 py-1 bg-zinc-50 border border-zinc-300 rounded text-[11px] text-zinc-900 outline-none focus:border-blue-500">
                </div>
                <div class="sm:col-span-3">
                    <button type="button" id="btn-status-${i}" onclick="toggleStatusState(${i})" class="w-full py-1 px-2 rounded-md font-bold text-[10px] uppercase border transition bg-red-100 text-red-600 border-red-300">
                        Pendiente
                    </button>
                    <input type="checkbox" id="inst-paid-${i}" class="hidden">
                </div>
            </div>
        `;
        container.appendChild(row);
    }
    autoDistributeAmount();
}

function autoPropagateFirstDate() {
    const firstDateVal = document.getElementById('inst-date-1')?.value;
    if (!firstDateVal) return;

    const parts = firstDateVal.split('-');
    if (parts.length !== 3) return; 

    const count = parseInt(document.getElementById('input-installments-count').value) || 1;
    const baseYear = parseInt(parts[0]);
    const baseMonth = parseInt(parts[1]) - 1;
    const baseDay = parseInt(parts[2]);

    for (let i = 2; i <= count; i++) {
        const nextDate = new Date(baseYear, baseMonth + (i - 1), baseDay);
        const yyyy = nextDate.getFullYear();
        const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
        const dd = String(nextDate.getDate()).padStart(2, '0');
        
        const dateInput = document.getElementById(`inst-date-${i}`);
        if (dateInput) {
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    }
}

function toggleStatusState(index) {
    const checkbox = document.getElementById(`inst-paid-${index}`);
    const btn = document.getElementById(`btn-status-${index}`);
    if (!checkbox || !btn) return;
    
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        btn.innerText = "Pagada";
        btn.className = "w-full py-1 px-2 rounded-md font-bold text-[10px] uppercase border transition bg-emerald-100 text-emerald-700 border-emerald-300";
    } else {
        btn.innerText = "Pendiente";
        btn.className = "w-full py-1 px-2 rounded-md font-bold text-[10px] uppercase border transition bg-red-100 text-red-600 border-red-300";
    }
}

function autoDistributeAmount() {
    const inputTotal = document.getElementById('input-total-amount');
    if (!inputTotal) return;
    
    const rawVal = inputTotal.value.replace(/\./g, '');
    const total = parseFloat(rawVal);
    const count = parseInt(document.getElementById('input-installments-count').value) || 1;
    
    if (!total || total <= 0) return;

    const baseAmount = Math.floor(total / count);
    const remainder = total - (baseAmount * count);

    for (let i = 1; i <= count; i++) {
        const el = document.getElementById(`inst-amount-${i}`);
        if (el) {
            const val = (i === count) ? baseAmount + remainder : baseAmount;
            el.value = new Intl.NumberFormat('es-CL').format(val);
        }
    }
}

async function handleCreateDebt(e) {
    e.preventDefault();
    const creditor = formatFirstLetter(document.getElementById('input-creditor').value);
    const type = formatFirstLetter(document.getElementById('input-debt-type').value);
    const count = parseInt(document.getElementById('input-installments-count').value) || 1;

    const installments = [];
    for (let i = 1; i <= count; i++) {
        const rawAmount = document.getElementById(`inst-amount-${i}`).value.replace(/\./g, '');

        installments.push({
            number: i,
            amount: parseFloat(rawAmount) || 0,
            date: document.getElementById(`inst-date-${i}`).value,
            paid: document.getElementById(`inst-paid-${i}`).checked
        });
    }

    await saveDebtItem({ creditor, type, installments });
    closeModal('modal-add-debt');
    document.getElementById('form-add-debt').reset();
    showAlert("¡Deuda añadida!", "Se ha registrado la nueva deuda.", "success");
}

function openEditInstallmentModal(debtId, index) {
    const debt = debtsData.find(d => d.id === debtId);
    if (!debt) return;
    const inst = debt.installments[index];

    document.getElementById('edit-debt-id').value = debtId;
    document.getElementById('edit-installment-index').value = index;
    document.getElementById('edit-installment-label').innerText = `Cuota N° ${inst.number} de ${debt.creditor}`;
    document.getElementById('edit-installment-amount').value = new Intl.NumberFormat('es-CL').format(inst.amount);
    document.getElementById('edit-installment-date').value = inst.date;

    document.getElementById('modal-edit-installment').classList.remove('hidden');
    document.getElementById('modal-edit-installment').classList.add('flex');
}

async function handleSaveEditedInstallment(e) {
    e.preventDefault();
    const debtId = document.getElementById('edit-debt-id').value;
    const index = parseInt(document.getElementById('edit-installment-index').value);
    const rawAmount = document.getElementById('edit-installment-amount').value.replace(/\./g, '');

    const debt = debtsData.find(d => d.id === debtId);
    if (debt) {
        debt.installments[index].amount = parseFloat(rawAmount) || 0;
        debt.installments[index].date = document.getElementById('edit-installment-date').value;
        await saveDebtItem(debt);
    }
    closeModal('modal-edit-installment');
    showAlert("¡Cuota actualizada!", "Se han modificado los datos de la cuota.", "success");
}

function openAddDebtModal() {
    generateInstallmentInputs();
    document.getElementById('modal-add-debt').classList.remove('hidden');
    document.getElementById('modal-add-debt').classList.add('flex');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}