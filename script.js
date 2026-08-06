const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby8s9yDFaXGs0DK1W6chdm4iWx2nEm_KTGIE7fGbz974k84QRA7FxA3nmzViOHyiVwx/exec';
let rawData = [];
let charts = {};
let activeFilteredData = [];

function getActivity(d) {
    const act = (d.activity || '').toString().trim();
    return act || 'Visit';
}

function isDuplicate(d) {
    return (d.duplicate || '').toString().trim().toLowerCase() === 'yes';
}

function normalizePhoneJS(v) {
    const digits = (v || '').toString().replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Strips any timestamp portion and returns a clean dd/mm/yyyy string.
function formatDateOnly(raw) {
    if (!raw) return '—';
    const s = raw.toString().trim();

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;

    // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ
    // Pulled straight out of the string — deliberately NOT routed
    // through `new Date()` + local getters, since that can shift
    // the day by one depending on the viewer's timezone.
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    const d = new Date(s);
    if (!isNaN(d)) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    return s;
}

function parseLeadDate(raw) {
    if (!raw) return new Date(0);
    const s = raw.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    const parts = s.split('/');
    if (parts.length === 3) {
        // dd/mm/yyyy (matches how the backend formats Date)
        const [d, m, y] = parts;
        const parsed = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
        if (!isNaN(parsed)) return parsed;
    }
    const parsed = new Date(s);
    return isNaN(parsed) ? new Date(0) : parsed;
}

// Finds the earliest OTHER record in the full dataset with the same
// phone number as `item`. Used to show what a duplicate lead's
// previous instance was (date + activity type).
function findPreviousInstance(item) {
    const phone = normalizePhoneJS(item.ownernumber);
    if (!phone) return null;

    const others = rawData.filter(d => d !== item && normalizePhoneJS(d.ownernumber) === phone);
    if (others.length === 0) return null;

    others.sort((a, b) => parseLeadDate(a.date || a.visitdate) - parseLeadDate(b.date || b.visitdate));
    return others[0];
}

function checkLogin() {
    if(document.getElementById('user').value === "1") {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dash').style.display = 'block';
        fetchData();
    }
}

async function fetchData() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getData');
        const text = await response.text();
        try {
            rawData = JSON.parse(text);
            if (rawData.error) { throw new Error(rawData.error); }
            setupFilters();
            apply();
        } catch (jsonErr) {
            console.error("Server Response:", text);
            alert("Data Error: The server sent a non-JSON response.");
        }
    } catch (e) {
        alert("Network Error: " + e.message);
    }
}

function setupFilters() {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const branches = [...new Set(rawData.map(d => d.branch))].filter(Boolean).sort();
    const emps = [...new Set(rawData.map(d => d.execname))].filter(Boolean).sort();
    const sectors = [...new Set(rawData.map(d => d.sector))].filter(Boolean).sort();

    const monthSel = document.getElementById('fMonth');
    monthSel.innerHTML = '<option value="All">All Months</option>';
    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = m;
        monthSel.appendChild(opt);
    });
    
    const pop = (id, list) => {
        const el = document.getElementById(id);
        el.innerHTML = `<option value="All">All ${id.replace('f', '')}s</option>`;
        list.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            el.appendChild(opt);
        });
    };
    pop('fBranch', branches); 
    pop('fEmp', emps); 
    pop('fSector', sectors);
}

function apply() {
    const m = document.getElementById('fMonth').value;
    const b = document.getElementById('fBranch').value;
    const e = document.getElementById('fEmp').value;
    const s = document.getElementById('fSector').value;

    activeFilteredData = rawData.filter(d => {
        const dateStr = d.visitdate || d.date || "";
        if (!dateStr) return false;
        const dObj = new Date(dateStr);
        if (isNaN(dObj.getTime())) return false;

        const matchMonth = (m === "All" || dObj.getMonth() == m);
        const matchBranch = (b === "All" || d.branch === b);
        const matchEmp = (e === "All" || d.execname === e);
        const matchSector = (s === "All" || d.sector === s);

        return matchMonth && matchBranch && matchEmp && matchSector;
    });

    updateUI(activeFilteredData);
}

function updateUI(data) {
    const sample = data[0] || {};
    const statusKey = Object.keys(sample).find(k => k.toLowerCase().includes('status')) || 'status';
    
    const getCount = (val) => {
        return data.filter(d => (d[statusKey] || "").toString().trim() === val).length;
    };

    const visitCount = data.filter(d => getActivity(d) === 'Visit').length;
    const callCount  = data.filter(d => getActivity(d) === 'Call').length;

    document.getElementById('tVisit').innerText = visitCount;
    document.getElementById('tCall').innerText  = callCount;
    document.getElementById('tTotal').innerText = data.length;
    document.getElementById('tInt').innerText   = getCount("Interested");
    document.getElementById('tFol').innerText   = getCount("Follow-up Required");
    document.getElementById('tNot').innerText   = getCount("Not Interested");

    const statusData = {
        "Interested": getCount("Interested"),
        "Follow-up Required": getCount("Follow-up Required"),
        "Not Interested": getCount("Not Interested")
    };

    renderChart('cStatus', 'pie', statusData, 'Lead Status', ['#34a853', '#fbbc05', '#ea4335']);
    
    const branchCount = data.reduce((a, c) => {
        const b = c.branch || "Unknown";
        a[b] = (a[b] || 0) + 1;
        return a;
    }, {});
    
    renderChart('cMain', 'bar', branchCount, 'Leads by Branch');
}

function renderChart(id, type, dataObj, label, colors) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: Object.keys(dataObj),
            datasets: [{ label: label, data: Object.values(dataObj), backgroundColor: colors || '#1a73e8' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, item) => {
                if (item.length > 0) {
                    const index = item[0].index;
                    const label = charts[id].data.labels[index];
                    if (id === 'cStatus') showLeadPopup(label);
                }
            },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

/** * Restored: Using showLeadPopup as defined in your HTML 
 */
function showLeadPopup(statusLabel) {
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    const sample = rawData[0] || {};
    const statusKey = Object.keys(sample).find(k => k.toLowerCase().includes('status')) || 'status';

    // Translates "Follow-up" button click to "Follow-up Required" data key
    let targetStatus = statusLabel === "Follow-up" ? "Follow-up Required" : statusLabel;

    const filtered = activeFilteredData.filter(d => {
        const currentStatus = (d[statusKey] || "").toString().trim();
        if (targetStatus === 'Total') return true;
        if (targetStatus === 'Visit') return getActivity(d) === 'Visit';
        if (targetStatus === 'Call') return getActivity(d) === 'Call';
        return currentStatus === targetStatus;
    });

    const summaryMap = filtered.reduce((acc, curr) => {
        const b = curr.branch || "N/A";
        if (!acc[b]) acc[b] = { branch: b, count: 0, items: [] };
        acc[b].count++;
        acc[b].items.push(curr);
        return acc;
    }, {});

    title.innerText = `${targetStatus} - Leads by Branch`;
    
    let html = `<table><tr><th>Branch Name</th><th>Count (Click to View Sectors)</th></tr>`;
    Object.values(summaryMap).forEach((row, index) => {
        const dataId = `br_${index}`;
        window[dataId] = row.items; 
        html += `<tr><td>${row.branch}</td><td class="clickable-count" onclick="showSectorLevel('${targetStatus}', '${row.branch}', '${dataId}')">${row.count}</td></tr>`;
    });
    body.innerHTML = html + `</table>`;
    modal.style.display = 'flex';
}

function showSectorLevel(status, branch, dataId) {
    const items = window[dataId];
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    
    const sectorMap = items.reduce((acc, curr) => {
        const s = curr.sector || "N/A";
        if (!acc[s]) acc[s] = { sector: s, count: 0, items: [] };
        acc[s].count++;
        acc[s].items.push(curr);
        return acc;
    }, {});

    title.innerText = `${branch} - Sector Distribution (${status})`;
    let html = `<table><tr><th>Sector</th><th>Count (Click for Details)</th></tr>`;
    Object.values(sectorMap).forEach((row, index) => {
        const subId = `sec_${index}`;
        window[subId] = row.items;
        html += `<tr><td>${row.sector}</td><td class="clickable-count" onclick="showDeepDetail('${subId}')">${row.count}</td></tr>`;
    });
    body.innerHTML = html + `</table><button onclick="showLeadPopup('${status}')" style="margin-top:10px; background:#666; color: white; border: none; padding: 10px; border-radius: 4px;">Back to Branch</button>`;
}

function showDeepDetail(dataId) {
    const items = window[dataId];
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    
    title.innerText = "Lead Owner Details";
    let html = `<table><tr><th>Activity</th><th>Product</th><th>Business Category</th><th>Owner Name</th><th>Owner Number</th><th>Duplicate</th><th>Prev. Instance Date</th><th>Prev. Activity</th></tr>`;
    items.forEach(item => {
        const activity = getActivity(item);
        const product = item.product || 'N/A';
        const category = item.businesscategory || item.sector || 'N/A';
        const name = item.ownername || item.name || 'N/A';
        const contact = item.ownernumber || item.mobile || item.contact || 'N/A';
        const dup = isDuplicate(item) ? '⚠ Yes' : 'No';

        let prevDate = '—';
        let prevActivity = '—';
        if (isDuplicate(item)) {
            const prev = findPreviousInstance(item);
            if (prev) {
                prevDate = formatDateOnly(prev.date || prev.visitdate);
                prevActivity = getActivity(prev);
            }
        }

        html += `<tr><td>${activity}</td><td>${product}</td><td>${category}</td><td>${name}</td><td>${contact}</td><td>${dup}</td><td>${prevDate}</td><td>${prevActivity}</td></tr>`;
    });
    body.innerHTML = html + `</table><button onclick="closeModal()" style="margin-top:15px; background:#666; color: white; border: none; padding: 10px 20px; border-radius: 4px;">Close</button>`;
}

function downloadCSV() {
    if (activeFilteredData.length === 0) return;
    const headers = Object.keys(activeFilteredData[0]);
    const csvRows = [headers.join(",")];
    activeFilteredData.forEach(row => {
        const values = headers.map(header => {
            const val = row[header] === null ? "" : row[header];
            return `"${val.toString().replace(/"/g, '""')}"`; 
        });
        csvRows.push(values.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SML_Group_Export_${new Date().getTime()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function closeModal() { 
    document.getElementById('modalOverlay').style.display = 'none'; 
}
