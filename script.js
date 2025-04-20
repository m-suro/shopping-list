const itemInput = document.getElementById('itemInput');
const addButton = document.getElementById('addButton');
const shoppingList = document.getElementById('shoppingList');
const clearButton = document.getElementById('clearButton');

// Function to add a new item
function addItem() {
    const itemText = itemInput.value.trim();
    if (itemText === '') {
        alert('Please enter an item.');
        return;
    }

    const li = document.createElement('li');

    const span = document.createElement('span');
    span.textContent = itemText;
    span.onclick = markDone; // Add click event to mark as done

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = deleteItem; // Add click event to delete

    li.appendChild(span);
    li.appendChild(deleteButton);
    shoppingList.appendChild(li);

    itemInput.value = ''; // Clear input field
    itemInput.focus(); // Set focus back to input
}

// Function to mark an item as done
function markDone(event) {
    const item = event.target.parentNode; // Get the li element
    item.classList.toggle('done');
}

// Function to delete an item
function deleteItem(event) {
    const item = event.target.parentNode; // Get the li element
    // Add animation class
    item.classList.add('removing');

    // Remove the item after the animation completes (400ms matches CSS animation duration)
    setTimeout(() => {
        shoppingList.removeChild(item);
    }, 400);
}

// Function to clear the entire list
function clearList() {
    // Add removing animation to all items
    const items = shoppingList.querySelectorAll('li');
    if (items.length === 0) return; // No items to clear

    items.forEach(item => {
        item.classList.add('removing');
    });

    // Clear the list after the longest animation completes
    setTimeout(() => {
        shoppingList.innerHTML = '';
    }, 400); // Match animation duration
}


// Event listeners
addButton.addEventListener('click', addItem);
itemInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        addItem();
    }
});
clearButton.addEventListener('click', clearList);
