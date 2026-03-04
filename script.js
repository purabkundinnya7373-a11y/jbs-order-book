import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Firebase Configuration ---
// Replace with your actual config from Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const reservationsRef = collection(db, "reservations");

let cart = [];


// --- Menu Data ---
const menuData = [
    { id: 1, name: "Masala Dosa", price: 140, category: "south", description: "Crispy crepe with spiced potato filling" },
    { id: 2, name: "Idli Sambar (2 pcs)", price: 90, category: "south", description: "Steamed rice cakes with lentil soup" },
    { id: 3, name: "Vada Sambar", price: 100, category: "south", description: "Savory fried donuts with sarsaparilla" },
    { id: 4, name: "Paneer Butter Masala", price: 260, category: "north", description: "Soft paneer in rich tomato gravy" },
    { id: 5, name: "Shahi Thali", price: 350, category: "north", description: "Complete meal with paneer, dal, rice, roti, and sweet" },
    { id: 6, name: "Chole Bhature", price: 180, category: "chaat", description: "Spiced chickpeas with fluffy deep-fried bread" },
    { id: 7, name: "Pani Puri (6 pcs)", price: 60, category: "chaat", description: "Crispy spheres with tangy spiced water" },
    { id: 8, name: "Gulab Jamun (2 pcs)", price: 80, category: "sweets", description: "Milk solids dumplings in sugar syrup" },
    { id: 9, name: "Kaju Barfi (250g)", price: 240, category: "sweets", description: "Premium cashew fudge" },
    { id: 10, name: "Veg Chowmein", price: 150, category: "chinese", description: "Stir-fried noodles with crunchy vegetables" }
];

// --- Global Reservation State ---
const CAPACITY_PER_SLOT = 25;
let allReservations = [];

// --- Real-time Firestore Listener ---
const q = query(reservationsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
    allReservations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    if (window.updateAdminTable) window.updateAdminTable();
});

// --- Menu Functions ---
function renderMenu(category = 'all') {
    const container = document.getElementById('menu-items');
    if (!container) return;
    container.innerHTML = '';
    const filtered = category === 'all' ? menuData : menuData.filter(item => item.category === category);

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                <p>${item.description}</p>
                <div class="item-price">₹${item.price}</div>
            </div>
            <button class="btn btn-outline btn-block" onclick="addToCart(${item.id})">Add to Order</button>
        `;
        container.appendChild(div);
    });
}

function addToCart(id) {
    const item = menuData.find(i => i.id === id);
    const existing = cart.find(c => c.id === id);

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    updateCart();
}
window.addToCart = addToCart;

function updateCart() {
    const cartList = document.getElementById('cart-list');
    const totalPriceEl = document.getElementById('total-price');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!cartList) return;

    cartList.innerHTML = '';
    if (cart.length === 0) {
        cartList.innerHTML = '<p class="empty-msg">Your hand is empty. Let\'s fill it with food!</p>';
        document.getElementById('bill-summary').style.display = 'none';
        checkoutBtn.disabled = true;
        totalPriceEl.innerText = '₹0';
        return;
    }

    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <span>${item.name} x${item.quantity}</span>
            <span>₹${item.price * item.quantity}</span>
        `;
        cartList.appendChild(div);
    });

    const gst = Math.round(subtotal * 0.05);
    const packing = cart.reduce((acc, item) => acc + (10 * item.quantity), 0);
    const total = subtotal + gst + packing;

    document.getElementById('bill-summary').style.display = 'block';
    document.getElementById('subtotal').innerText = `₹${subtotal}`;
    document.getElementById('gst').innerText = `₹${gst}`;
    document.getElementById('packing').innerText = `₹${packing}`;
    totalPriceEl.innerText = `₹${total}`;
    checkoutBtn.disabled = false;
}

// --- Reservation & Capacity Functions ---
function initReservation() {
    const resForm = document.getElementById('reservation-form');
    const resDate = document.getElementById('res-date');
    const resTime = document.getElementById('res-time');
    const resName = document.getElementById('res-name');

    if (!resForm) return;

    const today = new Date().toISOString().split('T')[0];
    if (resDate) {
        resDate.setAttribute('min', today);
        resDate.addEventListener('change', generateTimeSlots);
    }

    function getBookedSeats(date, time) {
        return allReservations
            .filter(b => b.date === date && b.time === time && b.status !== 'Cancelled')
            .reduce((sum, b) => sum + parseInt(b.guests), 0);
    }

    function generateTimeSlots() {
        if (!resTime || !resDate.value) return;
        const selectedDate = resDate.value;
        resTime.innerHTML = '<option value="">Select a time slot</option>';

        for (let hour = 8; hour < 22; hour++) {
            const time24 = `${hour.toString().padStart(2, '0')}:00`;
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            const displayTime = `${displayHour}:00 ${ampm}`;

            const booked = getBookedSeats(selectedDate, time24);
            const remaining = CAPACITY_PER_SLOT - booked;

            const option = document.createElement('option');
            option.value = time24;

            if (remaining <= 0) {
                option.textContent = `${displayTime} (Full)`;
                option.disabled = true;
            } else if (remaining < 10) {
                option.textContent = `${displayTime} (Limited: ${remaining} left)`;
            } else {
                option.textContent = displayTime;
            }
            resTime.appendChild(option);
        }
    }

    generateTimeSlots();

    resForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookingData = {
            name: resName.value,
            phone: document.getElementById('res-phone').value,
            email: document.getElementById('res-email').value,
            date: resDate.value,
            time: resTime.value,
            guests: document.getElementById('res-guests').value,
            requests: document.getElementById('res-requests').value,
            status: 'Pending',
            createdAt: serverTimestamp()
        };

        const submitBtn = resForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Availability...';

        try {
            const docRef = await addDoc(reservationsRef, bookingData);

            // UI Success State Transition
            const formGroups = resForm.querySelectorAll('.form-group, .form-row, .btn-block, .form-note');
            formGroups.forEach(el => el.style.display = 'none');

            const successView = document.getElementById('res-success');
            if (successView) {
                document.getElementById('success-id').textContent = docRef.id;
                document.getElementById('success-date').textContent = bookingData.date;
                document.getElementById('success-time').textContent = bookingData.time;
                successView.style.display = 'block';
            }
        } catch (error) {
            console.error("Error adding reservation: ", error);
            alert("Reservation failed. Please try again.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Request Reservation';
        }
    });
}

// --- Admin Dashboard Functions ---
window.showAdminDashboard = function () {
    const adminSection = document.getElementById('admin-dashboard');
    if (adminSection) {
        adminSection.style.display = adminSection.style.display === 'none' ? 'block' : 'none';
        updateAdminTable();
        if (adminSection.style.display === 'block') {
            window.scrollTo({ top: adminSection.offsetTop - 50, behavior: 'smooth' });
        }
    } else {
        createAdminUI();
    }
};

function createAdminUI() {
    const adminHtml = `
        <section id="admin-dashboard" class="container reveal active" style="padding: 60px 0; background: #fff; margin-top: 50px; border: 2px solid var(--primary); border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <div class="section-header" style="text-align:center; margin-bottom: 30px;">
                <h2 style="color: var(--dark);">Reservation Manager <span style="font-size: 14px; background: var(--primary); color: white; padding: 4px 10px; border-radius: 20px; vertical-align: middle;">PRO</span></h2>
                <p>Verify availability and manage seat occupancy</p>
            </div>
            <div style="overflow-x: auto; padding: 0 40px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--dark); color: white;">
                            <th style="padding: 15px; text-align: left; border-radius: 8px 0 0 0;">ID / Date</th>
                            <th style="padding: 15px; text-align: left;">Guest Info</th>
                            <th style="padding: 15px; text-align: left;">Details</th>
                            <th style="padding: 15px; text-align: center;">Delivery Status</th>
                            <th style="padding: 15px; text-align: left;">Status</th>
                            <th style="padding: 15px; text-align: center; border-radius: 0 8px 0 0;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="admin-table-body">
                        <!-- Dynamic content -->
                    </tbody>
                </table>
            </div>
        </section>
    `;
    document.querySelector('main').insertAdjacentHTML('beforeend', adminHtml);
    updateAdminTable();
    const adminSection = document.getElementById('admin-dashboard');
    window.scrollTo({ top: adminSection.offsetTop - 50, behavior: 'smooth' });
}

window.updateAdminTable = function () {
    const tbody = document.getElementById('admin-table-body');
    if (!tbody) return;

    if (allReservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: #888;">No reservations found.</td></tr>';
        return;
    }

    tbody.innerHTML = allReservations.map(res => {
        const getStatusIcon = (status) => {
            if (status === 'Sent') return '✅';
            if (status === 'Pending') return '⏳';
            if (status === 'Failed') return '❌';
            return '⚪';
        };

        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 15px;">
                <strong style="color: var(--primary);">${res.id}</strong><br>
                <small>${res.date}</small>
            </td>
            <td style="padding: 15px;">
                <strong>${res.name}</strong><br>
                <small>${res.phone}</small>
            </td>
            <td style="padding: 15px;">
                ${res.time} | ${res.guests} Guests
            </td>
            <td style="padding: 15px; text-align: center;">
                <div style="display: flex; gap: 8px; justify-content: center; font-size: 14px;">
                    <span title="Email: ${res.notifications.email}">${getStatusIcon(res.notifications.email)} 📧</span>
                    <span title="SMS: ${res.notifications.sms}">${getStatusIcon(res.notifications.sms)} 📱</span>
                    <span title="WhatsApp: ${res.notifications.whatsapp}">${getStatusIcon(res.notifications.whatsapp)} 💬</span>
                </div>
            </td>
            <td style="padding: 15px;">
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; 
                    background: ${res.status === 'Confirmed' ? '#d4edda' : res.status === 'Cancelled' ? '#f8d7da' : '#fff3cd'};
                    color: ${res.status === 'Confirmed' ? '#155724' : res.status === 'Cancelled' ? '#721c24' : '#856404'};">
                    ${res.status}
                </span>
            </td>
            <td style="padding: 15px; text-align: center;">
                ${res.status === 'Pending' ? `
                    <button onclick="manageBooking('${res.id}', 'Confirmed')" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Confirm</button>
                    <button onclick="manageBooking('${res.id}', 'Cancelled')" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Reject</button>
                ` : `<small style="color: #999;">Finalized</small>`}
            </td>
        </tr>
    `;
    }).join('');
}

window.manageBooking = async function (id, status) {
    const res = allReservations.find(r => r.id === id);
    if (!res) return;

    try {
        const docRef = doc(db, "reservations", id);
        await updateDoc(docRef, { status: status });
        alert(`Status updated to ${status} for ${res.name}.`);
    } catch (error) {
        console.error("Error updating booking: ", error);
        alert("Failed to update status.");
    }
}

// --- Hero & UI Functions ---
function initHeroSlideshow() {
    const slides = document.querySelectorAll('.slide');
    const indicators = document.querySelectorAll('.indicator');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    let currentSlide = 0;
    if (!slides.length) return;

    function showSlide(n) {
        slides[currentSlide].classList.remove('active');
        indicators[currentSlide].classList.remove('active');
        currentSlide = (n + slides.length) % slides.length;
        slides[currentSlide].classList.add('active');
        indicators[currentSlide].classList.add('active');
    }

    let slideInterval = setInterval(() => showSlide(currentSlide + 1), 6000);

    function resetTimer() {
        clearInterval(slideInterval);
        slideInterval = setInterval(() => showSlide(currentSlide + 1), 6000);
    }

    if (nextBtn) nextBtn.addEventListener('click', () => { showSlide(currentSlide + 1); resetTimer(); });
    if (prevBtn) prevBtn.addEventListener('click', () => { showSlide(currentSlide - 1); resetTimer(); });
    indicators.forEach((ind, i) => ind.addEventListener('click', () => { showSlide(i); resetTimer(); }));
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initReservation();
    initHeroSlideshow();
    renderMenu();

    // Tabs listener
    const tabs = document.querySelectorAll('.menu-tabs button');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu(btn.dataset.cat);
        });
    });

    // Mobile Nav
    const toggle = document.getElementById('mobile-menu');
    const nav = document.querySelector('.nav-links');
    if (toggle) {
        toggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            toggle.classList.toggle('open');
        });
    }
});
