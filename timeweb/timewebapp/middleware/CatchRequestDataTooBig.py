from django.core.exceptions import RequestDataTooBig
from django.http.response import HttpResponse
from django.urls import reverse

class CatchRequestDataTooBig(object):
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != reverse("settings"):
            try:
                request.body
            except RequestDataTooBig:
                return HttpResponse("RequestDataTooBig")
        response = self.get_response(request)
        return response