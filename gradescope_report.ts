
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
    name: string;
    loc: string;
    error: boolean;
    tests: Test[];
}

enum Err {
    Unknown = "Unknown",
    Compilation = "Compilation",
    OutOfMemory = "OutOfMemory",
    Timeout = "Timeout",
    Runtime = "Runtime",
}

interface Result {
    Ok?: TestBlock[];
    Err?: Err;
}

interface Evaluation {
    code: PathName;
    tests: string;
    result: Result;
}

interface ExamplarConfig {
    useWheats: boolean;
    chaffs: string[] | null;
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

enum ReportSection {
    Functionality = "Functionality",
    Wheat = "Wheat",
    Chaff = "Chaff"
}

enum ReportType {
    Examplar = "Examplar",
    Detailed = "Detailed",
    Score = "Score",
}

interface GradescopeTestReport {
    name: string;
    output: string;
    visibility: string;
    score?: number;
    max_score?: number;
    extra_data: {
        section: ReportSection;
        type: ReportType;
    }
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
function parse_command_line(): [string, string, string, string] {
    let args: string[] = process.argv.slice(2);

    if (args.length != 4) {
        throw("Usage: <infile> <outfile> <configfile> <scorefile>");
    }

    return [args[0], args[1], args[2], args[3]];
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
    Extracts the examplar config data from the config file
    Inputs: The `path` to the config file
    Outputs: The config data
*/
function parse_examplar_config_file(path: PathName): ExamplarConfig {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    return JSON.parse(contents);
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

function get_line_number(test_loc: string): string {
    return test_loc.split(".arr:")[1];
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
    let parts = loc.split("/");
    let ret = parts[parts.length - 1];

    return ret;
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
function generate_examplar_wheat_report(wheat_results: Evaluation[]): GradescopeTestReport {
    let wheat_messages: string[] = [].concat(...wheat_results.map(generate_wheat_messages));

    // Remove duplicates (from https://wsvincent.com/javascript-remove-duplicates-array/)
    wheat_messages = wheat_messages.filter((v, i) => wheat_messages.indexOf(v) === i);

    if (wheat_messages.length === 0) {
        return {
            name: "VALID",
            output: "These tests are valid and consistent with the assignment handout.",
            visibility: "visible",
            extra_data: {
                section: ReportSection.Wheat,
                type: ReportType.Examplar,
            },
        };
    } else {
        return {
            name: "INVALID",
            output: `Your test suite failed at least one of our wheats.\n${wheat_messages.join("\n")}`,
            visibility: "visible",
            extra_data: {
                section: ReportSection.Wheat,
                type: ReportType.Examplar,
            },
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
            messages.push(`Block "${block.name}" at lines ${get_line_number(block.loc)} raised an error.`);
        }

        let test: Test;
        for ([test, block] of invalid_tests) {
            messages.push(`Test failed in block "${block.name}" at lines ${get_line_number(block.loc)}; ` +
                          `Test location: ${get_line_number(test.loc)}`);
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
function generate_examplar_chaff_report(chaff_result: Evaluation, chaff_number: number): GradescopeTestReport {
    // Find the invalid tests/blocks
    let invalid: [[Test, TestBlock][], TestBlock[]] | null = 
        get_invalid_tests_and_blocks(chaff_result);

    let name: string;
    let output: string;
    if (invalid === null) {
        // Valid wheat
        name = `Chaff number ${chaff_number} not caught.`;
        output = "";
    } else if (chaff_result.result.Err) {
        // Test file errored
        name = `Chaff number ${chaff_number} caught!`;
        output = `Chaff errored: ${chaff_result.result.Err}.\n` +
            "Note that this means you are not testing defensively.";
    } else {
        let messages: string[] = [];

        let [invalid_tests, invalid_blocks] = invalid;

        let block: TestBlock;
        for (block of invalid_blocks) {
            messages.push(`Block "${block.name}" at lines ${get_line_number(block.loc)} raised an error.`);
        }

        let test: Test;
        for ([test, block] of invalid_tests) {
            messages.push(`Test block: ${block.name}; Test lines: ${get_line_number(test.loc)}`);
        }

        if (messages == []) {
            throw "Contact instructor; Chaff failed, but no reason given.";
        }

        name = `Chaff number ${chaff_number} caught!`;
        output = `The following tests caught this chaff:\n${messages.join("\n")}`;
    }

    return {
        name: name,
        output: output,
        visibility: "visible",
        extra_data: {
            section: ReportSection.Chaff,
            type: ReportType.Examplar,
        }
    };
}

// Generate TA reports

/*
    Generates a functionality report(s); 
    If test file errors, returns a single report with 0/1 and error;
    Otherwise, return report for each block, each out of 1

    Inputs: The `test_result` of a single test suite
    Outputs: A list of reports for each block
*/
function generate_functionality_report(test_result: Evaluation): GradescopeTestReport[] {
    let result: Result = test_result.result;

    // If errors, 0 functionality and provide error reason
    if (result.Err) {
        return [{
            name: get_code_file_name(test_result),
            output: `Error: ${result.Err}`,
            score: 0,
            max_score: 1,
            visibility: "visible",
            extra_data: {
                section: ReportSection.Functionality,
                type: ReportType.Detailed,
            }
        }];
    }

    // If no error, report what blocks passed/failed
    let reports: GradescopeTestReport[] = [];

    let block: TestBlock;
    for (block of result.Ok) {
        let output: string;
        let score: number;
        if (block.error) {
            // If the block errors, then failed block
            output = "Block errored.";
            score = 0;
        } else {
            // Otherwise, compare number of passed tests to total number of tests
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;

            if (passed_tests === total_tests) {
                output = `Passed all ${total_tests} tests in this block!`;
                score = 1;
            } else {
                output = `Missing ${total_tests - passed_tests} tests in this block`;
                score = 0;
            }
        }

        // Add block to report
        reports.push({
            name: block.name,
            output: output,
            score: score,
            max_score: 1,
            visibility: "after_published",
            extra_data: {
                section: ReportSection.Functionality,
                type: ReportType.Detailed,
            }
        });
    }

    return reports;
}

/*
    Takes a wheat evaluation, and finds all of the invalid tests and blocks;
    If the wheat passes, returns null;
    Otherwise, returns the pure locations of all invalid tests/blocks and 
                       the name of the block it contains/itself

    Inputs: The `wheat` evaluation
    Outputs: null if valid wheat, otherwise the invalid tests/blocks as:
             [list of (test location, block name), list of (block location, block name)]
*/
function get_invalid_tests_and_blocks_ta(wheat: Evaluation): [[string, string][], [string, string][]] | null {
    if (wheat.result.Err) {
        return [[],[]];
    }

    let invalid_tests: [string, string][] = [];
    let invalid_blocks: [string, string][] = [];

    let block: TestBlock;
    for (block of wheat.result.Ok) {
        // If the block errors, add to invalid_blocks
        if (block.error) {
            invalid_blocks.push([get_loc_name(block.loc), block.name]);
        }

        let test: Test;
        for (test of block.tests) {
            // If a test fails, add to invalid_tests
            if (!test.passed) {
                invalid_tests.push([get_loc_name(test.loc), block.name]);
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

    Inputs: The `wheat_result` evaluation
    Outputs: A report for the wheat
*/
function generate_detailed_wheat_report(wheat_result: Evaluation): GradescopeTestReport {
    // Find the invalid tests/blocks
    let invalid: [[string, string][], [string, string][]] | null = 
        get_invalid_tests_and_blocks_ta(wheat_result);

    let output: string;
    if (invalid === null) {
        // Valid wheat
        output = "Passed wheat!";
    } else if (wheat_result.result.Err) {
        // Test file errored
        output = `Wheat errored; ${wheat_result.result.Err}`;
    } else {
        let [invalid_tests, invalid_blocks] = invalid;
        if (invalid_tests.length > 0) {
            // Invalid test
            output = `Wheat failed test in block ${invalid_tests[0][1]}`;
        } else if (invalid_blocks.length > 0) {
            // Block errored
            output = `Wheat caused error in block ${invalid_blocks[0][1]}`;
        } else {
            throw "Wheat failed but no reason given.";
        }
    }

    return {
        name: get_code_file_name(wheat_result),
        score: (invalid === null) ? 1 : 0,
        max_score: 1,
        output: output,
        visibility: "after_published",
        extra_data: {
            section: ReportSection.Wheat,
            type: ReportType.Detailed,
        }
    };
}

/*
    A curried function which generates a chaff testing report;
    It first takes in the list of wheat evaluations, and finds all
        invalid tests and test blocks between wheats;
    It then takes in a chaff evaluation, and checks if it is caught
        by the valid tests/blocks

    Inputs: The `wheat_results` evaluations
    Outputs: A function which generates a chaff report from an evaluation
*/
function generate_detailed_chaff_report(wheat_results: Evaluation[]) {
    let all_invalid_tests: Set<string> = new Set(),
        all_invalid_blocks: Set<string> = new Set();

    // Go through wheats and find invalid tests/blocks
    let wheat_result: Evaluation;
    for (wheat_result of wheat_results) {
        let invalid: [[string, string][], [string, string][]] | null =
            get_invalid_tests_and_blocks_ta(wheat_result);

        if (invalid !== null) {
            let invalid_test: [string, string];
            for (invalid_test of invalid[0]) {
                all_invalid_tests.add(invalid_test[0]);
            }

            let invalid_block: [string, string];
            for (invalid_block of invalid[1]) {
                all_invalid_blocks.add(invalid_block[0]);
            }
        }
    }

    /*
        Generates a chaff testing report; ignores invalid tests/blocks;
        If the chaff is invalid, generates report with reason;
        Otherwise, generates report with negative message

        Inputs: The `chaff_results` to report
        Outputs: The report for the chaff
    */
    return function (chaff_result: Evaluation): GradescopeTestReport {
        let get_score_and_output = function (): {output: string, score: number} {
            if (chaff_result.result.Err) {
                // Test file errors
                return {
                    output: `Chaff caught; error: ${chaff_result.result.Err}!`,
                    score: 1
                };
            } else {
                // Loop through blocks to check if chaff is caught
                let block: TestBlock;
                for (block of chaff_result.result.Ok) {
                    if (block.error && !all_invalid_blocks.has(get_loc_name(block.loc))) {
                        // Block errors
                        return {
                            output: `Chaff caught; error in block ${block.name}!`,
                            score: 1
                        };
                    }
    
                    let test: Test;
                    for (test of block.tests) {
                        // Test fails
                        if (!test.passed && !all_invalid_tests.has(get_loc_name(test.loc))) {
                            return {
                                output: `Chaff caught; test failed in block ${block.name}!`,
                                score: 1
                            };
                        }
                    }
                }
    
                // If this is reached, the chaff is not caught
                return {
                    output: "Chaff not caught.",
                    score: 0
                };
            }
        }

        let result = get_score_and_output();

        return {
            name: get_code_file_name(chaff_result),
            output: result.output,
            score: result.score,
            max_score: 1,
            visibility: "after_published",
            extra_data: {
                section: ReportSection.Chaff,
                type: ReportType.Detailed,
            }
        }
    }
}

// Generate overall report

/*
    Generates the overall report from all provided reports
    Inputs: List of `all_reports` to include
    Outputs: The overall Gradescope report
*/
function generate_overall_report(all_reports: GradescopeTestReport[]): GradescopeReport {
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
    let [infile, outfile, configFile, scorefile]: [string, string, string, string] = parse_command_line();

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);

    // Split up evaluations into test, wheat, and chaff results
    let [test_results, wheat_results, chaff_results]: [Evaluation[], Evaluation[], Evaluation[]] =
        partition_results(results);

    // Extract config data
    let examplarConfig: ExamplarConfig = parse_examplar_config_file(configFile);

    // Get point value data
    let point_values: PointData = read_score_data_from_file(scorefile);


    /*
    ** Generating reports
    */

    let examplar_reports: GradescopeTestReport[];
    {
        // Wheats
        let wheat_report: GradescopeTestReport = generate_examplar_wheat_report(wheat_results);
            
        // Chaffs
        let chaff_reports: GradescopeTestReport[];
        if (wheat_report.name === "VALID") {
            chaff_reports = chaff_results.map((result, index) => generate_examplar_chaff_report(result, index));
        } else {
            chaff_reports = [];
        }

        examplar_reports = [].concat(
            [wheat_report],
            chaff_reports,
        );
    }

    let detailed_reports: GradescopeTestReport[];
    let score_reports: GradescopeTestReport[];
    {
        // Detailed reports

        let detailed_test_reports: GradescopeTestReport[][] =
            test_results.map(generate_functionality_report);

        let detailed_wheat_reports: GradescopeTestReport[] =
            wheat_results.map(generate_detailed_wheat_report);

        let detailed_chaff_reports: GradescopeTestReport[] =
            chaff_results.map(generate_detailed_chaff_report(wheat_results));
        
        detailed_reports = [].concat(
            ...detailed_test_reports,
            detailed_wheat_reports,
            detailed_chaff_reports,
        );

        // Score reports

        let functionality_scores: GradescopeTestReport[] = 
            detailed_test_reports.map(report => 
                generate_score_report(
                    report, 
                    point_values.functionality, 
                    "Functionality score", 
                    ReportSection.Functionality));

        let wheat_score: GradescopeTestReport =
            generate_score_report(
                detailed_wheat_reports, 
                point_values.testing, 
                "Wheats score", 
                ReportSection.Wheat);

        let chaff_score: GradescopeTestReport =
            generate_score_report(
                detailed_chaff_reports, 
                point_values.testing, 
                "Chaffs score", 
                ReportSection.Chaff);

        score_reports = [].concat(
            functionality_scores,
            [wheat_score],
            [chaff_score],
        );
    }

    // All reports
    let all_reports: GradescopeTestReport[] = [].concat(
        examplar_reports,
        detailed_reports,
        score_reports,
    );


    // Generate overall report
    let gradescope_report: GradescopeReport = generate_overall_report(all_reports);

    /*
    ** Handling output
    */

    write_report_to_file(outfile, gradescope_report);
}

main();
