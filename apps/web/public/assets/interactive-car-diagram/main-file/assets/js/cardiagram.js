
	//----------tooltip js code [START] -----------

	function showTooltip(evt, text) {
		const tooltip = document.getElementById("tooltip");
		const box = document.querySelector(".diagram-box");
		const rect = box.getBoundingClientRect();

		tooltip.innerHTML = text;
		tooltip.style.display = "block";

		let x = evt.clientX - rect.left + 25;
		let y = evt.clientY - rect.top - 10;

		// Right overflow 
		if (x + tooltip.offsetWidth > box.clientWidth) {
			x = evt.clientX - rect.left - tooltip.offsetWidth - 15;
			tooltip.classList.add("left-side");
		} else {
			tooltip.classList.remove("left-side");
		}

		// Left overflow
		if (x < 0) {
			x = 10;
		}

		// Bottom overflow
		if (y + tooltip.offsetHeight > box.clientHeight) {
			y = box.clientHeight - tooltip.offsetHeight - 10;
		}

		// Top overflow
		if (y < 0) {
			y = 10;
		}

		tooltip.style.left = x + "px";
		tooltip.style.top = y + "px";
	}

	// Hide tooltip
	function hideTooltip() {
		document.getElementById("tooltip").style.display = "none";
	}

	//----------tooltip js [END] code -----------