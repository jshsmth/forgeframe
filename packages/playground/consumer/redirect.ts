const hostUrl = import.meta.env.VITE_HOST_URL || "https://localhost:5174/";
const target = new URL(hostUrl);
const currentParams = new URLSearchParams(window.location.search);

for (const [key, value] of currentParams) {
	target.searchParams.set(key, value);
}

window.location.replace(target);
