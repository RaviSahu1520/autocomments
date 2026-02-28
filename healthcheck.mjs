async function check() {
    const report = await fetch('http://localhost:3000/reports/weekly?format=json');
    const data = await report.json();
    console.log(JSON.stringify(data, null, 2));
}
check();
