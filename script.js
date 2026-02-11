// Модальне вікно
const modal = document.getElementById("modal");
const openModal = document.getElementById("openModal");
const closeModal = document.getElementById("closeModal");
const saveChange = document.getElementById("saveChange");

openModal.onclick = () => modal.classList.remove("hidden");
closeModal.onclick = () => modal.classList.add("hidden");

// Вибір дати у календарі
const workDateInput = document.getElementById("workDate");
const selectedDate = document.getElementById("selectedDate");

workDateInput.addEventListener("input", () => {
    selectedDate.textContent = `Оберіть дату: ${workDateInput.value}`;
});

// Збереження зміни (просто виводить у console, поки немає backend)
saveChange.onclick = () => {
    const newDate = document.getElementById("newDate").value;
    const start = document.getElementById("startTime").value;
    const end = document.getElementById("endTime").value;

    if (!newDate || !start || !end) {
        alert("Заповніть всі поля!");
        return;
    }

    console.log(`Нова зміна: ${newDate}, ${start}–${end}`);
    modal.classList.add("hidden");
};