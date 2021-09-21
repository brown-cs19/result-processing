
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

enum Visibility {
    Visible = "visible",
    AfterPublished = "after_published",
    Hidden = "hidden",
}

enum ReportSection {
    Functionality = "Functionality",
    Wheat = "Wheat",
    Chaff = "Chaff",
}

enum ReportType {
    Examplar = "Examplar",
    Detailed = "Detailed",
    Score = "Score",
}

interface GradescopeReport {
    visibility: string;
    stdout_visibility: string;
    tests: GradescopeTestReport[];
    score: number;
    max_score: number;
}

interface GradescopeTestReport {
    name: string;
    output: string;
    score?: number;
    max_score?: number;
    visibility: string;
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
function parse_command_line(): [string, string, string, string | null] {
    let args: string[] = process.argv.slice(2);

    if (args.length === 3) {
        return [args[0], args[1], args[2], null];
    } else if (args.length === 4) {
        return [args[0], args[1], args[2], args[3]];
    } else {
        throw("Usage: <infile> <outfile> <configfile> <scorefile>");
    }
}

/*
    Read raw evaluation data from JSON file
    Inputs: The `path` to the evaluation file
    Outputs: List of evaluations present in file
*/
function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    let evaluations: Evaluation[] = JSON.parse(contents);

    return evaluations;
}

/*
    Splits the evaluations into functionality, wheats, and chaffs
    Inputs: The list of `results` to be split
    Outputs: The `[test_results, wheat_results, chaff_results]`
*/
function partition_results(results: Evaluation[]): [Evaluation[], Evaluation[], Evaluation[]] {
    let test_results: Evaluation[] = [];
    let wheat_results: Evaluation[] = [];
    let chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        let code_name: string = get_code_dir_name(result);
        if (code_name.includes("wheat")) {
            wheat_results.push(result);
        } else if (code_name.includes("chaff")) {
            chaff_results.push(result);
        } else {
            test_results.push(result);
        }
    };

    return [test_results, wheat_results, chaff_results];
}

/*
    Normalize locations to ignore directory source (in place)
    Inputs: An evaluation to fix
*/
function normalize_code_names(evaluation: Evaluation) {
    if (evaluation.result.Ok) {
        evaluation.result.Ok.forEach(block => {
            block.loc = get_loc_name(block.loc);
            block.tests.forEach(test => {
                test.loc = get_loc_name(test.loc);
            });
        });
    }
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
    return path.basename(evaluation.code);
}

function get_code_dir_name(evaluation: Evaluation): string {
    let path = require('path');
    return path.basename(path.dirname(evaluation.code));
}

function get_test_file_name(evaluation: Evaluation): string {
    let path = require('path');
    return path.dirname(evaluation.tests.split(";")[1]);
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

interface TestAndBlock {
    test: Test,
    block: TestBlock
}

enum TestFailure {
    Pass,
    Fail,
    Err
}

interface TestFailureReport {
    success: TestFailure
    failures?: {
        tests: TestAndBlock[],
        blocks: TestBlock[]
    }
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
function get_invalid_tests_and_blocks(wheat: Evaluation): TestFailureReport {
    if (wheat.result.Err) {
        return { success: TestFailure.Err };
    }

    let invalid_tests: TestAndBlock[] = [];
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
                invalid_tests.push({ test: test, block: block });
            }
        }
    }

    if ((invalid_tests.length === 0) && (invalid_blocks.length === 0)) {
        // This means the wheat is valid
        return { success: TestFailure.Pass };
    } else {
        return {
            success: TestFailure.Fail,
            failures: {
                tests: invalid_tests,
                blocks: invalid_blocks
            }
        };
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
    let full_wheat_report: WheatMessagesReport = {
        valid: true,
        messages: []
    };
    let wheat_result: Evaluation;
    for (wheat_result of wheat_results) {
        let wheat_report: WheatMessagesReport = generate_wheat_messages(wheat_result);
        if (!wheat_report.valid) {
            full_wheat_report.valid = false;
            full_wheat_report.messages.push(...wheat_report.messages);
        }
    }

    let name: string;
    let output: string;
    if (full_wheat_report.valid) {
        name = "VALID";
        output = "These tests are valid and consistent with the assignment handout.";
    } else {
        // Remove duplicates (from https://wsvincent.com/javascript-remove-duplicates-array/)
        let messages = full_wheat_report.messages;
        messages = messages.filter((v, i) => messages.indexOf(v) === i);

        name = "INVALID";
        output = `Your test suite failed at least one of our wheats.\n${messages.join("\n")}`;
    }

    return {
        name: name,
        output: output,
        visibility: Visibility.Visible,
        extra_data: {
            section: ReportSection.Wheat,
            type: ReportType.Examplar,
        },
    };
}

interface WheatMessagesReport {
    valid: boolean,
    messages?: string[]
}

function generate_wheat_messages(wheat_result: Evaluation): WheatMessagesReport {
    // Find the invalid tests/blocks
    let test_report: TestFailureReport = get_invalid_tests_and_blocks(wheat_result);

    if (test_report.success === TestFailure.Pass) {
        // Valid wheat
        return { valid: true };
    } else if (test_report.success === TestFailure.Err) {
        // Test file errored
        return {
            valid: false,
            messages: [`Wheat errored; ${wheat_result.result.Err}`]
        };
    } else if (test_report.success === TestFailure.Fail) {
        let messages: string[] = [];

        let invalids = test_report.failures;

        let block: TestBlock;
        for (block of invalids.blocks) {
            messages.push(`Block "${block.name}" at lines ${get_line_number(block.loc)} raised an error.`);
        }

        let test: TestAndBlock;
        for (test of invalids.tests) {
            messages.push(`Test failed in block "${test.block.name}" at lines ${get_line_number(test.block.loc)}; ` +
                          `Test location: ${get_line_number(test.test.loc)}`);
        }

        if (messages.length === 0) {
            throw "Contact instructor; Wheat failed, but no reason given.";
        }

        return {
            valid: true,
            messages: messages
        };
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
    let test_report: TestFailureReport = get_invalid_tests_and_blocks(chaff_result);

    let name: string;
    let output: string;
    if (test_report.success === TestFailure.Pass) {
        // Valid wheat
        name = `Chaff number ${chaff_number} not caught.`;
        output = "";
    } else if (test_report.success === TestFailure.Err) {
        // Test file errored
        name = `Chaff number ${chaff_number} caught!`;
        output = `Chaff errored: ${chaff_result.result.Err}.\n` +
            "Note that this means you are not testing defensively.";
    } else if (test_report.success === TestFailure.Fail) {
        let messages: string[] = [];

        let invalids = test_report.failures;

        let block: TestBlock;
        for (block of invalids.blocks) {
            messages.push(`Block "${block.name}" at lines ${get_line_number(block.loc)} raised an error.`);
        }

        let test: TestAndBlock;
        for (test of invalids.tests) {
            messages.push(`Test block: "${test.block.name}"; Test lines: ${get_line_number(test.test.loc)}`);
        }

        if (messages.length === 0) {
            throw "Contact instructor; Chaff failed, but no reason given.";
        }

        name = `Chaff number ${chaff_number} caught!`;
        output = `The following tests caught this chaff:\n${messages.join("\n")}`;
    }

    return {
        name: name,
        output: output,
        visibility: Visibility.Visible,
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
            visibility: Visibility.Visible,
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
            name: `Test: "${block.name}"`,
            output: output,
            score: score,
            max_score: 1,
            visibility: Visibility.AfterPublished,
            extra_data: {
                section: ReportSection.Functionality,
                type: ReportType.Detailed,
            }
        });
    }

    return reports;
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
    let test_report: TestFailureReport = get_invalid_tests_and_blocks(wheat_result);

    let output: string;
    let score: number;
    if (test_report.success === TestFailure.Pass) {
        // Valid wheat
        output = "Passed wheat!";
        score = 1;
    } else if (test_report.success === TestFailure.Err) {
        // Test file errored
        output = `Wheat errored; ${wheat_result.result.Err}`;
        score = 0;
    } else if (test_report.success === TestFailure.Fail) {
        let invalids = test_report.failures;
        output = "";
        score = 0;

        let test: TestAndBlock;
        for (test of invalids.tests) {
            output += `Wheat failed test in block "${test.block.name}" at location ${test.test.loc}\n`;
        }

        let block: TestBlock
        for (block of invalids.blocks) {
            output = `Wheat caused error in block "${block.name}"\n`;
        }

        if (output === "") {
            throw "Wheat failed but no reason given.";
        }
    }

    return {
        name: `Wheat: ${get_code_file_name(wheat_result)}`,
        score: score,
        max_score: 1,
        output: output,
        visibility: Visibility.AfterPublished,
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
    let all_invalid_tests: Test[] = [];
    let all_invalid_blocks: TestBlock[] = [];

    // Go through wheats and find invalid tests/blocks
    let wheat_result: Evaluation;
    for (wheat_result of wheat_results) {
        let test_report: TestFailureReport = get_invalid_tests_and_blocks(wheat_result);

        if (test_report.success !== TestFailure.Pass) {
            let invalids = test_report.failures;
            all_invalid_tests.push(...invalids.tests.map(test => test.test));
            all_invalid_blocks.push(...invalids.blocks);
        }
    }

    let all_invalid_locs = [...all_invalid_tests, ...all_invalid_blocks].map(inv => inv.loc);

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
                    if (block.error && !all_invalid_locs.includes(block.loc)) {
                        // Block errors
                        return {
                            output: `Chaff caught; error in block "${block.name}"!`,
                            score: 1
                        };
                    }

                    let test: Test;
                    for (test of block.tests) {
                        // Test fails
                        if (!test.passed && !all_invalid_locs.includes(test.loc)) {
                            return {
                                output: `Chaff caught; test failed in block "${block.name}"!`,
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
            name: `Chaff: ${get_code_file_name(chaff_result)}`,
            output: result.output,
            score: result.score,
            max_score: 1,
            visibility: Visibility.AfterPublished,
            extra_data: {
                section: ReportSection.Chaff,
                type: ReportType.Detailed,
            }
        }
    }
}

/*
    Generates a score report for a given list of reports

    Inputs: The `reports` to summarize;
            The `point_values` to apply to the reports;
            The `name` to use in the report
*/
function generate_score_report(
        reports: GradescopeTestReport[],
        point_values: Map<string, number>,
        name: string,
        section: ReportSection): GradescopeTestReport {

    // Find the score summary from the reports
    let total_score: number = 0;
    let possible_score: number = 0;

    let report: GradescopeTestReport;
    for (report of reports) {
        let points = point_values.has(report.name) ? point_values.get(report.name) : 1;

        total_score += report.score === report.max_score ? points : 0;
        possible_score += points;
    }

    // Return report
    return {
        name: `Score: ${name}`,
        output: "",
        score: total_score,
        max_score: possible_score,
        visibility: Visibility.Hidden,
        extra_data: {
            section: section,
            type: ReportType.Score,
        },
    };
}

// Generate overall report

/*
    Generates the overall report from all provided reports
    Inputs: List of `all_reports` to include
    Outputs: The overall Gradescope report
*/
function generate_overall_report(all_reports: GradescopeTestReport[]): GradescopeReport {
    return {
        visibility: Visibility.Visible,
        stdout_visibility: Visibility.Visible,
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
    let [infile, outfile, scorefile, configfile]: [string, string, string, string | null] = parse_command_line();

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);

    // Split up evaluations into test, wheat, and chaff results
    let [test_results, wheat_results, chaff_results]: [Evaluation[], Evaluation[], Evaluation[]] =
        partition_results(results);

    // Fix code names to be uniform across all evaluations (unaffected by test name)
    {
        let results: Evaluation[];
        for (results of [test_results, wheat_results, chaff_results]) {
            results.forEach(normalize_code_names);
        }
    }

    // Extract config data
    let examplar_config: ExamplarConfig | null = configfile === null ? null : parse_examplar_config_file(configfile);

    // Get point value data
    let point_values: PointData = read_score_data_from_file(scorefile);

    /*
    ** Generating reports
    */

    let examplar_reports: GradescopeTestReport[] = [];
    if (examplar_config !== null && examplar_config.useWheats) {
        // Wheats
        let wheat_report: GradescopeTestReport = generate_examplar_wheat_report(wheat_results);
        examplar_reports.push(wheat_report);

        // Chaffs
        if (wheat_report.name === "VALID") {
            // Filter out based on config
            let examplar_chaff_results: Evaluation[];
            if (examplar_config.chaffs === null) {
                examplar_chaff_results = chaff_results;
            } else {
                examplar_chaff_results = chaff_results.filter(result => examplar_config.chaffs.includes(get_code_file_name(result)));
            }

            // Generate chaff reports
            examplar_chaff_results.forEach((result, index) => {
                let report = generate_examplar_chaff_report(result, index);
                examplar_reports.push(report);
            });
        }
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
                    "functionality",
                    ReportSection.Functionality));

        let wheat_score: GradescopeTestReport =
            generate_score_report(
                detailed_wheat_reports,
                point_values.testing,
                "wheats",
                ReportSection.Wheat);

        let chaff_score: GradescopeTestReport =
            generate_score_report(
                detailed_chaff_reports,
                point_values.testing,
                "chaffs",
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
