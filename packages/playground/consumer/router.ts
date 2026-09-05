const path = window.location.pathname;

if (path === "/tests" || path.startsWith("/tests/")) {
	void import("./test-lab/main");
} else {
	void import("./main");
}
