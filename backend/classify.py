"""The rules that turn ISACA's free-form roster fields into the groups the site shows.

Change a grouping here, re-run the ingest, and every chart follows.
"""
import re

SENIORITY = [
    "C-suite and executives",
    "Directors, managers and consultants",
    "Staff and senior staff",
    "Students and academics",
    "Other",
    "Not stated",
]

CERTS = ["CISA", "CISM", "CRISC", "CDPSE", "CGEIT", "CCP", "CCA", "AAISM", "AAIA", "CSXF", "CSXA", "AAIR", "CCOA"]
AI_CERTS = ["AAIA", "AAISM", "AAIR"]

MEMBER_LEVELS = ["Platinum", "Gold", "Silver", "Bronze", "Member"]
GENDERS = ["Male", "Female", "Not stated"]
TENURE_BANDS = ["Under 1 year", "1 to 3 years", "3 to 5 years", "5 to 10 years", "10 to 20 years", "20 years or more"]
TENURE_EDGES = [-1, 1, 3, 5, 10, 20, 100]
CERT_COUNTS = ["None", "1", "2", "3 or more"]

MEMBER_TYPES = {
    "Recent Graduate (1st year)": "Recent graduate",
    "Recent Graduate (2nd year)": "Recent graduate",
    "Recent Graduate Membership": "Recent graduate",
    "Professional Membership": "Professional",
    "Student Membership": "Student",
    "Expired Professional Membership": "Expired professional",
    "Retired Membership": "Retired",
}

EMPLOYER_ALIASES = {
    "pricewaterhousecoopers": "PwC", "pwc": "PwC", "pricewaterhousecoopers llp": "PwC", "pwc llp": "PwC",
    "citigroup": "Citi", "citi": "Citi", "citibank": "Citi", "citigroup inc": "Citi",
    "ernst & young": "EY", "ernst and young": "EY", "ey": "EY", "ernst & young llp": "EY",
    "raymond james financial": "Raymond James", "raymond james": "Raymond James",
    "jpmorgan chase": "JPMorgan Chase", "jp morgan chase": "JPMorgan Chase",
    "jpmorgan chase & co": "JPMorgan Chase", "jpmorgan": "JPMorgan Chase", "jp morgan": "JPMorgan Chase",
    "jpmc": "JPMorgan Chase",
    "deloitte": "Deloitte", "deloitte & touche": "Deloitte", "deloitte & touche llp": "Deloitte", "deloitte llp": "Deloitte",
    "kpmg": "KPMG", "kpmg llp": "KPMG", "rsm us llp": "RSM", "rsm": "RSM", "rsm us": "RSM",
    "usf": "University of South Florida", "university of south florida": "University of South Florida",
    "the university of tampa": "University of Tampa",
    "publix super markets inc": "Publix Super Markets",
    "crowe llp": "Crowe", "crowe": "Crowe", "a-lign": "A-LIGN", "protiviti": "Protiviti",
}
EMPLOYER_BLANKS = {
    "tbd", "not applicable", "not employed", "unknown", "n/a", "na", "none", "self", "self employed",
    "self-employed", "unemployed", "retired", "student", "-", ".",
}


def job_function(area):
    """Group ISACA's Professional Area into a job function."""
    if not isinstance(area, str):
        return "Not stated"
    s = area.lower()
    if "student" in s or "professor" in s or "teacher" in s:
        return "Student and academic"
    if "audit" in s:
        return "Audit"
    if "security" in s or "ciso" in s:
        return "Security"
    if "compliance" in s or "risk" in s or "privacy" in s:
        return "Risk, compliance and privacy"
    if s.startswith("it ") or "cio/cto" in s or "technology" in s:
        return "IT and technology"
    if "ceo" in s or "cfo" in s or "finance" in s:
        return "Executive and finance"
    return "Other"


def seniority(area):
    """Group ISACA's Professional Area into a seniority level."""
    if not isinstance(area, str):
        return "Not stated"
    s = area.lower()
    if "student" in s or "professor" in s or "teacher" in s:
        return "Students and academics"
    if any(k in s for k in ["ciso", "cio/cto", "ceo", "cfo", "cae", "chief", "vp/evp"]):
        return "C-suite and executives"
    if "director/manager" in s:
        return "Directors, managers and consultants"
    if "staff" in s or "auditor" in s:
        return "Staff and senior staff"
    return "Other"


def employer(company):
    """Merge common spellings of the same employer; drop blanks and placeholders."""
    if not isinstance(company, str):
        return None
    key = re.sub(r"\s+", " ", re.sub(r"[.,]", "", company.strip().lower()))
    if not key or key in EMPLOYER_BLANKS:
        return None
    return EMPLOYER_ALIASES.get(key, company.strip())


def city(name):
    if not isinstance(name, str):
        return None
    c = re.sub(r"\s+", " ", name.strip()).title()
    c = re.sub(r"^(St\.?|Saint)\s+", "St. ", c)
    return c.replace("Land O Lakes", "Land O' Lakes").replace("Land O'Lakes", "Land O' Lakes")


def chapter(name):
    return re.sub(r"\s+Chapter$", "", str(name).strip())
