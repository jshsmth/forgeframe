const path = window.location.pathname;

if (path === "/company" || path === "/company/") {
	void import("./company-demo/main");
} else if (path === "/tests" || path.startsWith("/tests/")) {
	void import("./test-lab/main");
} else {
	void import("./main");
}
