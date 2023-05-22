import puppeteer from "puppeteer";
import { appendFileSync } from "fs";

class Job {
    constructor(job_title = "Job Title", location = "Location", address = "Address", job_id = "Job ID", url = "URL", job_description = "Job Description", 
    shifts = "Shifts", job_level = "Job Level", travel = "Travel", salary = "Salary", responsibilities = "Responsibilities") {
        this.job_title = job_title;
        this.location = location;
        this.address = address;
        this.job_id = job_id;
        this.url = url;
        this.job_description = job_description;
        this.shifts = shifts;
        this.job_level = job_level;
        this.travel = travel;
        this.salary = salary;
        this.responsibilities = responsibilities;
    }
    saveAsCSV() {
        var csv = `"${this.job_title}","${this.location}","${this.address}","${this.job_id}",${this.url},"${this.job_description}","${this.shifts}","${this.job_level}","${this.travel}","${this.salary}","${this.responsibilities}"\n`;
        try {
            appendFileSync("./jobs.csv", csv);
        } catch (err) {
            console.error(err);
        }
    }
}

const startApp = (csvData) => {
    var header = new Job();
    header.saveAsCSV();
    for (var row of csvData) {
        var job = new Job(row['job_title'], row['location'], row['address'], row['job_id'], row['url'], row['job_description'], row['shifts'], row['job_level'], row['travel'], row['salary'], row['responsibilities']);
        job.saveAsCSV();
    }
}

const getQuotes = async () => {
    // Start a Puppeteer session with:
    var browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });

    // Open a new page
    var page = await browser.newPage();

    // On this new page:
    await page.goto("https://jobs.walgreens.com/en/search-jobs/", {
        waitUntil: "load",
        timeout: 0,
    });
    await page.waitForSelector('#close-modal');
    await page.evaluate(() => {
        document.querySelector('#close-modal').click();
    });
    await page.waitForSelector('.filter-checkbox[data-display="United States"]');
    await page.evaluate(() => {
        document.querySelector('.filter-checkbox[data-display="United States"]').click();
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
        document.querySelector('.filter-checkbox[data-display="Pharmacist"]').click();
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
        document.querySelector('.filter-checkbox[data-display="Pharmacy Tech"]').click();
    });
    await page.waitForTimeout(2000);
    var state_num = await page.evaluate(() => {
        return document.querySelectorAll('section[data-filter-id="3"] li').length;
    });
    var states = await page.evaluate(() => {
        return document.querySelectorAll('section[data-filter-id="3"] li .filter-checkbox');
    });
    console.log(state_num);
    var result = [];
    
    for (var i = 1; i <= state_num; i++){
        var flag = await page.evaluate((index) => {
            var temp = document.querySelector('section[data-filter-id="3"] li:nth-child(' + index + ') .filter-checkbox');
            if (!temp){
                return true;
            }
            if (!temp.checked){
                temp.click();
            }
            return false;
        }, i);
        if (flag){
            break;
        }
        await page.waitForTimeout(2000);

        if (i != 1){
            await page.evaluate((index) => {
                var temp = document.querySelector('section[data-filter-id="3"] li:nth-child(' + index + ') .filter-checkbox');
                if (temp.checked){
                    temp.click();
                    return temp.getAttribute('data-display');
                }
            }, i-1);
        }
        await page.waitForTimeout(2000);

        var job1_flag = await page.evaluate(() => {
            var temp = document.querySelector('.filter-checkbox[data-display="Pharmacist"]');
            if (temp){
                if (!temp.checked){
                    temp.click();
                    return 2;
                }
                return 1;
            }
            return 0;
        });
        if (job1_flag == 2){
            await page.waitForTimeout(2000);
        }

        var job2_flag = await page.evaluate(() => {
            var temp = document.querySelector('.filter-checkbox[data-display="Pharmacy Tech"]');
            if (temp){
                if (!temp.checked){
                    temp.click();
                    return 2;
                }
                return 1;
            }
            return 0;
        });
        if (job2_flag == 2){
            await page.waitForTimeout(2000);
        }

        if (job1_flag != 0 || job2_flag != 0){
            var page_num = await page.evaluate(() => {
                var pagination = document.querySelector('.pagination-total-pages');
                if (pagination){
                    return parseInt(pagination.innerText.substr(2));
                }
                else{
                    return 1;
                }
            });
            console.log(i, page_num);
            for (var j = 0; j < page_num; j++){
                result = result.concat(await extractedEvaluateCall(page));
                if (j !== page_num - 1) {
                    await page.waitForSelector(".pagination > .pagination-paging > .next");
                    await page.evaluate(() => {
                        var next_btn = document.querySelector('.pagination > .pagination-paging > .next');
                        if (next_btn){
                            next_btn.click();
                        }
                    });
                    await page.waitForSelector("#search-results-list:not(.loading)");
                }
            }
        }
    }

    var final_result = [];
    var lll = 0;
    for (var row of result){
        await page.goto(row['url'], {
            waitUntil: "load",
            timeout: 0,
        });
        var { address, job_id, job_description, shifts, job_level, travel, salary, responsibilities } = await extractedJobDetail(page);
        final_result.push({
            'job_title': row['job_title'],
            'location': row['location'],
            'address': address,
            'job_id': job_id,
            'url': row['url'],
            'job_description': job_description,
            'shifts': shifts,
            'job_level': job_level,
            'travel': travel,
            'salary': salary,
            'responsibilities': responsibilities,
        })
        if (lll > 50){
            break;
        }
        lll++;
    }
    // Close the browser
    await browser.close();
    startApp( final_result );
};

async function extractedEvaluateCall(page) {
    // Get page data
    var quotes = await page.evaluate(() => {
        var rows = document.querySelectorAll(".branded-list__list-item");
        return Array.from(rows).map((row) => {
            var url = row.querySelector("a").href;
            var job_title = row.querySelector("h2").innerText;
            var location = row.querySelector("span").innerText;
            return { job_title, url, location };
        });
    });
    return quotes;
}

async function extractedJobDetail(page){
    var result = await page.evaluate(() => {
        var temp = document.querySelectorAll('.job-id:not(.copy--blue)');
        var job_id = temp[0].innerText.replace('Job ID ', '');  // Job ID
        var job_type = '';  // Job Type
        if (temp.length == 2){
            job_type = temp[1].innerText.replace('Job Type: ', '');
        }
        var address = document.querySelector('.jd-address').innerText;  // Address
        temp = document.querySelectorAll('.ats-description');
        var job_objectives = '';    // Job Objectives
        var responsibilities;   // Responsibilities

        var section = document.querySelectorAll('#anchor-overview ul > li > p');
        var shifts = '';    // Shifts
        var job_level = ''; // Job Level
        var travel = '';    // Travel
        var salary = '';    // Salary
        if (section){
            shifts = section[0].innerText.replace('Shifts: ', '');
            job_level = section[1].innerText.replace('Job Level: ', '');
            travel = section[2].innerText.replace('Travel: ', '');
            salary = section[3].innerText.replace('Salary: ', '');
        }
        return { job_id, job_type, address, job_objectives, responsibilities, shifts, job_level, travel, salary };   
    });
    return result;
}

const getScreenShot = async () => {
    var browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
    });

    // Open a new page
    var page = await browser.newPage();
    await page.goto("https://www.w3schools.com/", {
        waitUntil: "load",
        timeout: 0,
    });
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    await page.screenshot({ path: 'image1.png', clip: { x: 0, y: 0, width: 1920, height: 10000 } });
    await browser.close();
}

// getScreenShot();
getQuotes();