
/********************\
***** Data Types *****
\********************/

// Input data types

type PathName = string;

interface Test {
    loc: string;
    passed: boolean;
}

interface TestBlock {
    name: string,
    loc: string,
    error: boolean,
    tests: Test[],
}

enum Err {
    Unknown = "Unknown",
    Compilation = "Compilation",
    OutOfMemory = "OutOfMemory",
    Timeout = "Timeout",
    Runtime = "Runtime",
}

interface Result {
    Ok?: TestBlock[],
    Err?: Err
}

interface Evaluation {
    code: PathName;
    tests: string;
    result: Result;
}

interface PointData {
    functionality: Map<string, number>;
    testing: Map<string, number>;
}

// Gradescope types

interface GradescopeReport {
    visibility: string;
    stdout_visibility: string;
    tests: GradescopeTestReport[];
    score: number;
    max_score: number;
}

interface GradescopeTestReport {
    name: string;
    output?: string;
    // visibility?: string;
}


/************************\
***** Implementation *****
\************************/


/********************\
*** Handling input ***
\********************/

/*
    Parse command line arguments
    Outputs: The file locations of `[infile, outfile, scorefile]`
*/
function parse_command_line(): [string, string, string] {
    let args: string[] = process.argv.slice(2);

    if (args.length != 3) {
        throw("Usage: <infile> <outfile> <scorefile>");
    }

    return [args[0], args[1], args[2]];
}

/*
    Read raw evaluation data from JSON file
    Inputs: The `path` to the evaluation file
    Outputs: List of evaluations present in file
*/
function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    return JSON.parse(contents);
}

/*
    Splits the evaluations into functionality, wheats, and chaffs
    Inputs: The list of `results` to be split
    Outputs: The `[test_results, wheat_results, chaff_results]`
*/
function partition_results(results: Evaluation[]): [Evaluation[], Evaluation[], Evaluation[]] {
    let test_results: Evaluation[] = [],
        wheat_results: Evaluation[] = [],
        chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        if (result.code.includes("wheat")) { 
            wheat_results.push(result);

        } else if (result.code.includes("chaff")) { 
            chaff_results.push(result);

        } else { 
            test_results.push(result);
        }
    };

    return [test_results, wheat_results, chaff_results];
}

/*
    Read scoring data from JSON file
    Inputs: The `path` to the score file
    Outputs: Object containing the scoring data
*/
function read_score_data_from_file(path: PathName): PointData {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    let raw_score_data = JSON.parse(contents);

    function json_to_map(obj): Map<string, number> {
        let map: Map<string, number> = new Map();
        let name: string;
        for (name in obj) {
            map.set(name, obj[name]);
        }

        return map;
    }

    let functionality_map: Map<string, number> = json_to_map(raw_score_data.functionality);
    let testing_map: Map<string, number> = json_to_map(raw_score_data.testing);

    return {
            functionality: functionality_map,
            testing: testing_map
        };
}


/*********************\
*** Handling output ***
\*********************/

/*
    Writes a Gradescope report to a file
    Inputs: The `path` to the output file;
            The `report` to be written
*/
function write_report_to_file(path: PathName, report: GradescopeReport) {
    let fs = require('fs');
    let data: string = JSON.stringify(report);
    fs.writeFileSync(path, data);
    console.log("Wrote output to " + path);
}

/************************\
*** Generating reports ***
\************************/

//// Helpers

/*
    Gets the name a file from path name
    Inputs: The `path_name` of the file
    Outputs: The name of the file
*/
function get_code_file_name(evaluation: Evaluation): string {
    let path = require('path');
    return path.parse(evaluation.code).base;
}

function get_test_file_name(evaluation: Evaluation): string {
    let path = require('path');
    return path.parse(evaluation.tests.split(";")[1]).dir;
}

/*
    Gets the pure location of a test or test block from a full location name
    E.g.: "file:///autograder/results/docdiff-wheat-2017.arr;docdiff-tests.arr/tests.arr:8:0-19:3"
          --> "tests.arr:8:0-19:3"
    Used to uniquely identify tests/test blocks between evaluations

    Inputs: The full location name
    Outputs: The pure location name
*/
function get_loc_name(loc: string): string {
    return loc.split("/")[-1];
}


// Generate student reports

/*
    Takes a wheat evaluation, and finds all of the invalid tests and blocks;
    If the wheat passes, returns null;
    Otherwise, returns the pure locations of all invalid tests/blocks and 
                       the name of the block it contains/itself

    Inputs: The `wheat` evaluation
    Outputs: null if valid wheat, otherwise the invalid tests/blocks as:
             [list of (test location, block name), list of (block location, block name)]
*/
function get_invalid_tests_and_blocks(wheat: Evaluation): [[Test, TestBlock][], TestBlock[]] | null {
    if (wheat.result.Err) {
        return [[],[]];
    }

    let invalid_tests: [Test, TestBlock][] = [];
    let invalid_blocks: TestBlock[] = [];

    let block: TestBlock;
    for (block of wheat.result.Ok) {
        // If the block errors, add to invalid_blocks
        if (block.error) {
            invalid_blocks.push(block);
        }

        let test: Test;
        for (test of block.tests) {
            // If a test fails, add to invalid_tests
            if (!test.passed) {
                invalid_tests.push([test, block]);
            }
        }
    }

    if ((invalid_tests.length === 0) && (invalid_blocks.length === 0)) {
        // This means the wheat is valid
        return null;
    } else {
        return [invalid_tests, invalid_blocks];
    }
}

/*
    Generates a wheat testing report; 
    If the wheat is invalid, generates report with reason;
    Otherwise, generates report with positive message

    Inputs: The `wheat_results` evaluations
    Outputs: A report for the wheat
*/
function generate_wheat_report(wheat_results: Evaluation[]): GradescopeTestReport {
    let wheat_messages: string[] = [].concat(...wheat_results.map(generate_wheat_messages));

    if (wheat_messages.length === 0) {
        return {
                "name": `VALID`,
                "output": "These tests are valid and consistent with the assignment handout."
            }
    } else {
        console.log(`Wheat failed. Messages: ${wheat_messages.length}`);
        return {
                "name": `INVALID`,
                "output": "Your test suite failed at least one of our wheats.\n" + 
                          wheat_messages.join("\n")
            };
    }
}

function generate_wheat_messages(wheat_result: Evaluation): string[] {
    // Find the invalid tests/blocks
    let invalid: [[Test, TestBlock][], TestBlock[]] | null = 
        get_invalid_tests_and_blocks(wheat_result);

    let output: string;
    if (invalid === null) {
        // Valid wheat
        return [];
    } else if (wheat_result.result.Err) {
        // Test file errored
        return [`Wheat errored; ${wheat_result.result.Err}`];
    } else {
        let messages: string[] = [];

        let [invalid_tests, invalid_blocks] = invalid;

        let block: TestBlock;
        for (block of invalid_blocks) {
            messages.push(`Block "${block.name}" at location ${block.loc} raised an error.`);
        }

        let test: Test;
        for ([test, block] of invalid_tests) {
            messages.push(`Test failed in block "${block.name}" at location ${block.loc};\n` +
                          `Test location: ${test.loc}`);
        }

        if (messages == []) {
            throw "Contact instructor; Wheat failed, but no reason given.";
        }

        return messages;
    }
}

/*
    Generates a chaff testing report; only run if all wheats passed;
    If the chaff is invalid, generates report with reason;
    Otherwise, generates report with negative message

    Inputs: The `chaff_results` to report
    Outputs: The report for the chaff
*/
function generate_chaff_report(chaff_result: Evaluation, chaff_number: number): GradescopeTestReport {
    // Find the invalid tests/blocks
    let invalid: [[Test, TestBlock][], TestBlock[]] | null = 
        get_invalid_tests_and_blocks(chaff_result);

    let output: string;
    if (invalid === null) {
        // Valid wheat
        return {
                name: `Chaff number ${chaff_number} not caught.`
            };
    } else if (chaff_result.result.Err) {
        // Test file errored
        return {
                name: `Chaff number ${chaff_number} caught!`,
                output: `Wheat errored: ${chaff_result.result.Err}.\n` +
                        "Note that this means you are not testing defensively."
            };
    } else {
        let messages: string[] = [];

        let [invalid_tests, invalid_blocks] = invalid;

        let block: TestBlock;
        for (block of invalid_blocks) {
            messages.push(`Block "${block.name}" at location ${block.loc} raised an error.`);
        }

        let test: Test;
        for ([test, block] of invalid_tests) {
            messages.push(`Test block: ${block.name}; Test location: ${test.loc}`);
        }

        if (messages == []) {
            throw "Contact instructor; Chaff failed, but no reason given.";
        }

        return {
                name: `Chaff cnumber ${chaff_number} caught!`,
                output: "The following tests caught this chaff:" +
                        messages.join("\n")
            };
    }
}


// Generate overall report

/*
    Generates the overall report from all provided reports
    Inputs: List of `all_reports` to include
    Outputs: The overall Gradescope report
*/
function generate_overall_report(
        all_reports: GradescopeTestReport[]): GradescopeReport {
    return {
            visibility: "visible",
            stdout_visibility: "visible",
            tests: all_reports,
            score: 0,
            max_score: 0,
        };
}


function main() {

    /*
    ** Handling input
    */

    // Get input and output file names from command line
    let [infile, outfile, scorefile]: [string, string, string] = parse_command_line();

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);

    // Split up evaluations into test, wheat, and chaff results
    let [test_results, wheat_results, chaff_results]: [Evaluation[], Evaluation[], Evaluation[]] =
        partition_results(results);

    // Get point value data
    // let point_values: PointData = read_score_data_from_file(scorefile);


    /*
    ** Generating reports
    */

    // Generate student reports

    // Wheats
    let wheat_report: GradescopeTestReport = generate_wheat_report(wheat_results);
        
    // Chaffs
    let chaff_reports: GradescopeTestReport[];
    if (wheat_report.name === "VALID") {
        chaff_reports = chaff_results.map(generate_chaff_report);
    } else {
        chaff_reports = [];
    }

    // Overview
    let student_reports: GradescopeTestReport[] = [].concat(
        [wheat_report,],
        chaff_reports,);


    // Generate overall report

    let gradescope_report: GradescopeReport = generate_overall_report(student_reports);


    /*
    ** Handling output
    */

    write_report_to_file(outfile, gradescope_report);
}

main();
